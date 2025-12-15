import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View } from 'react-native';
import Animated, {
    useAnimatedRef,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withSpring,
    runOnJS,
    scrollTo,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// Small helper for stable springs
const SPRING = { damping: 18, stiffness: 220, mass: 0.9 };

function clamp(v, min, max) {
    'worklet';
    return Math.max(min, Math.min(max, v));
}

function arrayMove(arr, from, to) {
    'worklet';
    const next = arr.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

function getOffsetForKey(order, heights, key) {
    'worklet';
    let y = 0;
    for (let i = 0; i < order.length; i++) {
        const k = order[i];
        if (k === key) return y;
        y += heights[k] ?? 0;
    }
    return y;
}

function getIndexForY(order, heights, y) {
    'worklet';
    // chooses index by midpoints (center crossing)
    let acc = 0;
    for (let i = 0; i < order.length; i++) {
        const h = heights[order[i]] ?? 0;
        const mid = acc + h / 2;
        if (y < mid) return i;
        acc += h;
    }
    return order.length - 1;
}

const SortableItem = ({
    item,
    itemKey,
    orderSV,
    heightsSV,
    activeKeySV,
    scrollYSV,
    scrollRef,
    containerPaddingTop,
    longPressMs,
    handleStyle,
    renderItem,
    onCommitOrderJS,
    dataRef,
}) => {
    const translateY = useSharedValue(0);
    const startOffset = useSharedValue(0);

    const isActive = useDerivedValue(() => activeKeySV.value === itemKey);

    // Auto-scroll (basic)
    const maybeAutoScroll = useCallback((absoluteYInScroll) => {
        'worklet';
        const EDGE = 110;
        const SPEED = 18;

        // scroll window height isn't known on UI thread, so we do a simple edge push
        // based on absoluteYInScroll relative to current scroll position.
        const yInViewport = absoluteYInScroll - scrollYSV.value;

        if (yInViewport < EDGE) {
            scrollTo(scrollRef, 0, clamp(scrollYSV.value - SPEED, 0, 1e9), false);
        } else if (yInViewport > 700) {
            // 700 is a decent default; you can tune or make it a prop
            scrollTo(scrollRef, 0, scrollYSV.value + SPEED, false);
        }
    }, [scrollRef, scrollYSV]);

    const pan = useMemo(() => {
        return Gesture.Pan()
            .activateAfterLongPress(longPressMs)
            .onBegin(() => {
                activeKeySV.value = itemKey;
                translateY.value = 0;
                startOffset.value = getOffsetForKey(orderSV.value, heightsSV.value, itemKey) + containerPaddingTop;
            })
            .onUpdate((e) => {
                if (activeKeySV.value !== itemKey) return;

                translateY.value = e.translationY;

                // where is the item's center in scroll content coordinates?
                const currentTop = startOffset.value - containerPaddingTop + translateY.value;
                const h = heightsSV.value[itemKey] ?? 0;
                const centerY = currentTop + h / 2;

                const fromIndex = orderSV.value.indexOf(itemKey);
                const toIndex = getIndexForY(orderSV.value, heightsSV.value, centerY);

                if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
                    orderSV.value = arrayMove(orderSV.value, fromIndex, toIndex);
                }

                // nudge scrolling if near edges
                maybeAutoScroll(currentTop + h / 2);
            })
            .onFinalize(() => {
                if (activeKeySV.value === itemKey) {
                    // commit to JS
                    runOnJS(onCommitOrderJS)(orderSV.value);
                    activeKeySV.value = null;
                    translateY.value = 0;
                }
            });
    }, [
        itemKey,
        orderSV,
        heightsSV,
        activeKeySV,
        translateY,
        startOffset,
        containerPaddingTop,
        longPressMs,
        maybeAutoScroll,
        onCommitOrderJS,
    ]);

    const animatedStyle = useAnimatedStyle(() => {
        const order = orderSV.value;
        const heights = heightsSV.value;

        const base = getOffsetForKey(order, heights, itemKey) + containerPaddingTop;

        if (activeKeySV.value === itemKey) {
            return {
                position: 'absolute',
                left: 0,
                right: 0,
                transform: [{ translateY: startOffset.value + translateY.value }],
                zIndex: 999,
            };
        }

        return {
            position: 'absolute',
            left: 0,
            right: 0,
            transform: [{ translateY: withSpring(base, SPRING) }],
            zIndex: 1,
        };
    });

    return (
        <Animated.View style={animatedStyle}>
            <View
                style={{ position: 'relative' }}
                onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    // update heights in JS -> mirrored to SV by parent
                    // parent passes stable ref via dataRef; we do JS state update there
                    // noop here; handled by wrapper below
                }}
            >
                {renderItem({ item, itemKey, isActive: activeKeySV.value === itemKey })}

                {/* Drag handle overlay (ONLY this starts drag) */}
                <GestureDetector gesture={pan}>
                    <View
                        style={[
                            {
                                position: 'absolute',
                                left: 0,
                                top: 0,
                            },
                            handleStyle,
                        ]}
                        pointerEvents="box-only"
                    />
                </GestureDetector>
            </View>
        </Animated.View>
    );
};

const SortableWorkoutList = ({
    data,
    keyExtractor,
    renderItem,
    onReorder,
    contentContainerStyle,
    footer,
    longPressMs = 180,
    // This overlay should match your grip area
    handleStyle = { left: 16, top: 12, width: 44, height: 44 },
    // Padding to match your screen layout
    containerPaddingTop = 0,
}) => {
    const dataRef = useRef(data);
    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    const keys = useMemo(() => data.map((it, idx) => String(keyExtractor(it, idx))), [data, keyExtractor]);

    const [heightsJS, setHeightsJS] = useState({}); // key -> height

    const scrollRef = useAnimatedRef();
    const scrollYSV = useSharedValue(0);
    const activeKeySV = useSharedValue(null);
    const orderSV = useSharedValue(keys);
    const heightsSV = useSharedValue({});

    // Keep order in sync if data changes (add/remove)
    useEffect(() => {
        orderSV.value = keys;
    }, [keys, orderSV]);

    // Mirror heights to UI thread
    useEffect(() => {
        heightsSV.value = heightsJS;
    }, [heightsJS, heightsSV]);

    const onScroll = useAnimatedScrollHandler({
        onScroll: (e) => {
            scrollYSV.value = e.contentOffset.y;
        },
    });

    const totalHeight = useDerivedValue(() => {
        const o = orderSV.value;
        const h = heightsSV.value;
        let sum = containerPaddingTop;
        for (let i = 0; i < o.length; i++) sum += h[o[i]] ?? 0;
        // also allow footer space
        return sum + 1;
    });

    const containerStyle = useAnimatedStyle(() => {
        return { height: totalHeight.value };
    });

    const commitOrderJS = useCallback(
        (nextKeys) => {
            // build map
            const map = new Map();
            const cur = dataRef.current || [];
            for (let i = 0; i < cur.length; i++) {
                map.set(String(keyExtractor(cur[i], i)), cur[i]);
            }
            const next = nextKeys.map((k) => map.get(String(k))).filter(Boolean);
            onReorder?.(next);
        },
        [onReorder, keyExtractor]
    );

    return (
        <Animated.ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={contentContainerStyle}
        >
            <Animated.View style={[{ position: 'relative', width: '100%' }, containerStyle]}>
                {keys.map((k, index) => {
                    const item = data[index];
                    return (
                        <View
                            key={k}
                            onLayout={(e) => {
                                const h = e.nativeEvent.layout.height;
                                setHeightsJS((prev) => {
                                    if (prev[k] === h) return prev;
                                    return { ...prev, [k]: h };
                                });
                            }}
                            style={{ position: 'absolute', left: 0, right: 0, opacity: 0 }}
                            pointerEvents="none"
                        >
                            {/* hidden measurer */}
                            {renderItem({ item, itemKey: k, isActive: false })}
                        </View>
                    );
                })}

                {orderSV.value.map ? null : null /* noop; keeps lint happy */}

                {keys.map((k) => {
                    const item = data.find((it, idx) => String(keyExtractor(it, idx)) === k);
                    if (!item) return null;

                    return (
                        <SortableItem
                            key={`draggable-${k}`}
                            item={item}
                            itemKey={k}
                            orderSV={orderSV}
                            heightsSV={heightsSV}
                            activeKeySV={activeKeySV}
                            scrollYSV={scrollYSV}
                            scrollRef={scrollRef}
                            containerPaddingTop={containerPaddingTop}
                            longPressMs={longPressMs}
                            handleStyle={handleStyle}
                            renderItem={renderItem}
                            onCommitOrderJS={commitOrderJS}
                            dataRef={dataRef}
                        />
                    );
                })}
            </Animated.View>

            {footer ? footer : null}
        </Animated.ScrollView>
    );
};

export default SortableWorkoutList;
