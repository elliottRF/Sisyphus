import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

/**
 * Overlay-based exercise reordering.
 *
 * Holding a card's header opens a full-area overlay (ReorderOverlay) over the
 * list showing one compact row per exercise. The held row is positioned
 * directly from the gesture's absolute Y coordinate, so it is always exactly
 * under the finger — the underlying list is never collapsed or scrolled
 * during the drag. Releasing commits the new order and scrolls the expanded
 * list to the dropped exercise.
 *
 * The screen wires it up by:
 * - attaching `listWrapperRef` to the View wrapping the list (the overlay's
 *   coordinate frame),
 * - rendering <ReorderOverlay ref={overlayRef} fingerY={fingerY} .../> inside
 *   that wrapper while `session` is set,
 * - passing `startReorder` / `endReorder` / `fingerY` to each card.
 */
export const useOverlayReorder = (listRef, data, setData) => {
    const [session, setSession] = useState(null); // { activeId, frame: {y, height} }
    const sessionRef = useRef(null);
    const overlayRef = useRef(null);
    const listWrapperRef = useRef(null);
    const fingerY = useSharedValue(0);

    const dataRef = useRef(data);
    dataRef.current = data;

    const startReorder = useCallback((itemId, absoluteY) => {
        if (dataRef.current.length < 2) return;
        // A focused set input would dismiss the keyboard mid-drag and resize
        // the viewport; settle that before measuring the overlay frame.
        Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        fingerY.value = absoluteY;
        const wrapper = listWrapperRef.current;
        if (!wrapper?.measureInWindow) return;
        wrapper.measureInWindow((x, y, width, height) => {
            if (!(height > 0)) return;
            // The gesture may already have ended (very short hold).
            if (sessionRef.current === 'ended') {
                sessionRef.current = null;
                return;
            }
            const next = { activeId: itemId, frame: { y, height } };
            sessionRef.current = next;
            setSession(next);
        });
    }, [fingerY]);

    const endReorder = useCallback(() => {
        const current = sessionRef.current;
        if (!current) {
            // Mark so a measureInWindow still in flight doesn't open the
            // overlay after the finger is already up.
            sessionRef.current = 'ended';
            setTimeout(() => {
                if (sessionRef.current === 'ended') sessionRef.current = null;
            }, 300);
            return;
        }
        if (current === 'ended') return;
        sessionRef.current = null;

        const order = overlayRef.current?.getOrder?.();
        let toIndex = -1;
        if (Array.isArray(order)) {
            const prev = dataRef.current;
            const byId = new Map(prev.map(item => [String(item.id), item]));
            const next = order.map(id => byId.get(id)).filter(Boolean);
            if (next.length === prev.length) {
                const changed = next.some((item, i) => item !== prev[i]);
                if (changed) {
                    setData(next);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                toIndex = next.findIndex(item => String(item.id) === String(current.activeId));
            }
        }
        setSession(null);

        if (toIndex >= 0) {
            // Bring the dropped exercise into view once the reordered list
            // has committed.
            setTimeout(() => {
                try {
                    listRef.current?.scrollToIndex({ index: toIndex, viewPosition: 0.2, animated: false });
                } catch (e) { }
            }, 80);
        }
    }, [listRef, setData]);

    // Fallback so the post-drop scrollToIndex never throws when the target
    // frame hasn't been measured yet.
    const handleScrollToIndexFailed = useCallback((info) => {
        try {
            listRef.current?.scrollToOffset({
                offset: Math.max(0, (info?.averageItemLength || 100) * (info?.index || 0)),
                animated: false,
            });
        } catch (e) { }
    }, [listRef]);

    return {
        session,
        overlayRef,
        listWrapperRef,
        fingerY,
        startReorder,
        endReorder,
        handleScrollToIndexFailed,
        isReordering: !!session,
    };
};
