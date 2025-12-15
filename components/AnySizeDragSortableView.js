import React from 'react';
import {
    StyleSheet,
    ScrollView,
    View,
    PanResponder,
    LayoutAnimation,
    Platform,
    UIManager,
} from 'react-native';

const PropTypes = require('prop-types');
const ANIM_DURATION = 220;

if (Platform.OS === 'android' && UIManager?.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default class AnySizeDragSortableView extends React.PureComponent {
    constructor(props) {
        super(props);

        this.layoutMap = new Map();
        this.keyToIndexMap = new Map();

        this.isMovePanResponder = false;

        this._panResponder = PanResponder.create({
            // DO NOT steal touches unless we’re actively dragging
            onStartShouldSetPanResponder: () => false,
            onStartShouldSetPanResponderCapture: () => false,

            // Become responder only when startTouch() has been called (long press on handle)
            onMoveShouldSetPanResponder: () => this.isMovePanResponder,
            onMoveShouldSetPanResponderCapture: () => this.isMovePanResponder,

            onPanResponderMove: (evt, gestureState) => this.moveTouch(evt, gestureState),
            onPanResponderRelease: () => this.endTouch(),
            onPanResponderTerminationRequest: () => false,
            onShouldBlockNativeResponder: () => false,
        });

        this.state = {
            selectedItem: null,
            selectedKey: null,
            selectedOriginLayout: null,
            selectedPosition: null,
            scrollEnabled: true,
        };
    }

    componentWillUnmount() {
        if (this.isScaleRecovery) clearTimeout(this.isScaleRecovery);
        this.clearAutoInterval();
    }

    componentDidMount() {
        this.initTag();
        this.autoMeasureHeight();
    }

    componentDidUpdate() {
        this.autoMeasureHeight();
    }

    autoMeasureHeight = () => {
        if (!this.isHasMeasure) {
            setTimeout(() => {
                this.scrollTo(1, false);
                this.scrollTo(0, false);
            }, 30);
        }
    };

    initTag = () => {
        this.clearAutoInterval();
        this.autoObj = {
            curDy: 0,
            scrollDx: 0,
            scrollDy: 0,
            hasScrollDy: null,
            forceScrollStatus: 0,
        };
    };

    isStartupAuto = () => this.curScrollData != null;

    dealtScrollStatus = () => {
        const scrollData = this.curScrollData;
        if (!scrollData?.offsetY && scrollData?.offsetY !== 0) return;
        const { totalHeight, windowHeight, offsetY } = scrollData;
        if (totalHeight <= windowHeight + offsetY) this.autoObj.forceScrollStatus = -2;
        else if (offsetY <= 0) this.autoObj.forceScrollStatus = 2;
    };

    clearAutoInterval = () => {
        if (this.autoInterval) {
            clearInterval(this.autoInterval);
            this.autoInterval = null;
        }
    };

    startAutoScroll = () => {
        if (this.autoInterval != null) return;

        this.autoInterval = setInterval(() => {
            if (
                this.autoObj.forceScrollStatus === 0 ||
                this.autoObj.forceScrollStatus === 2 ||
                this.autoObj.forceScrollStatus === -2
            ) {
                this.clearAutoInterval();
                return;
            }

            if (!this.curScrollData?.hasScroll) return;

            if (this.autoObj.forceScrollStatus === 1) this.autoObj.scrollDy += this.props.autoThrottle;
            else if (this.autoObj.forceScrollStatus === -1) this.autoObj.scrollDy -= this.props.autoThrottle;

            this.scrollTo(this.autoObj.scrollDy, false);
            this.dealtScrollStatus();

            const nextGesture = {
                ...(this.preGestureState || {}),
                dx: this.autoObj.scrollDx,
                dy: this.autoObj.curDy + this.autoObj.scrollDy,
            };

            if (Platform.OS === 'android') {
                setTimeout(() => {
                    if (this.isHasMove) this.moveTouch(null, nextGesture);
                }, 1);
            } else {
                this.moveTouch(null, nextGesture);
            }
        }, this.props.autoThrottleDuration);
    };

    startTouch = (item, index) => {
        const { keyExtractor, headerViewHeight } = this.props;

        this.isHasMove = false;
        this.isHasMeasure = true;
        this.preMoveKeyObj = null;

        if (this.isStartupAuto()) {
            this.autoObj.scrollDy = this.autoObj.hasScrollDy = this.curScrollData.offsetY;
        }

        const key = keyExtractor(item, index);
        const curLayout = this.layoutMap.get(key);
        if (!curLayout) return;

        const firstOffsetY = (this.curScrollData && this.curScrollData.offsetY) || 0;
        const initTop = parseInt(curLayout.y - firstOffsetY + headerViewHeight + 0.5);

        this.setState(
            {
                scrollEnabled: false,
                selectedItem: item,
                selectedKey: key,
                selectedOriginLayout: { ...curLayout },
                selectedPosition: {
                    left: parseInt(curLayout.x + 0.5),
                    top: initTop,
                    initTop,
                    width: curLayout.width,
                    height: curLayout.height,
                },
            },
            () => {
                this.isMovePanResponder = true;
            }
        );
    };

    moveTouch = (nativeEvent, gestureState) => {
        this.isHasMove = true;

        if (nativeEvent) this.preGestureState = gestureState;

        const { selectedKey, selectedOriginLayout, selectedPosition } = this.state;
        const {
            areaOverlapRatio,
            headerViewHeight,
            childMarginTop,
            childMarginBottom,
            childMarginLeft,
            childMarginRight,
        } = this.props;

        if (!selectedOriginLayout || !selectedKey) return;

        const curLayout = this.layoutMap.get(selectedKey);
        if (!curLayout) return;

        let { dx, dy, vy, moveY, y0 } = gestureState;

        if (this.isStartupAuto()) {
            const curDis = selectedOriginLayout.y + dy - this.autoObj.hasScrollDy;

            if (nativeEvent != null) {
                const tempStatus = this.autoObj.forceScrollStatus;

                const minDownDiss = curDis + selectedPosition.height + headerViewHeight;
                const maxUpDiss = curDis + headerViewHeight;

                if ((tempStatus === 0 || tempStatus === 2) && vy > 0.01 && minDownDiss > this.curScrollData.windowHeight) {
                    this.autoObj.curDy = dy;
                    this.autoObj.forceScrollStatus = 1;
                    this.startAutoScroll();
                } else if ((tempStatus === 0 || tempStatus === -2) && -vy > 0.01 && maxUpDiss < 0) {
                    this.autoObj.curDy = dy;
                    this.autoObj.forceScrollStatus = -1;
                    this.startAutoScroll();
                }
            }

            if (vy != null) {
                if (this.autoObj.forceScrollStatus >= 1 && -vy > 0.01) this.autoObj.forceScrollStatus = 0;
                else if (this.autoObj.forceScrollStatus <= -1 && vy > 0.01) this.autoObj.forceScrollStatus = 0;
            }

            this.autoObj.scrollDx = dx;

            dy = dy - this.autoObj.hasScrollDy;
            if (nativeEvent != null) {
                dy = dy + this.autoObj.scrollDy;
                if (this.autoObj.forceScrollStatus === 1 || this.autoObj.forceScrollStatus === -1) return;
            }
        }

        if (!this.isUpdating) {
            const moveX1 = selectedOriginLayout.x + dx + childMarginLeft;
            const moveX2 = moveX1 + selectedOriginLayout.width - childMarginRight;
            const moveY1 = selectedOriginLayout.y + dy + childMarginTop;
            const moveY2 = moveY1 + selectedOriginLayout.height - childMarginBottom;

            const moveArea = selectedOriginLayout.width * selectedOriginLayout.height;
            const layouts = this.layoutMap.values();

            for (let layout of layouts) {
                if (layout.key === curLayout.key) continue;

                const tempX1 = layout.x + childMarginLeft;
                const tempX2 = tempX1 + layout.width - childMarginRight;
                const tempY1 = layout.y + childMarginTop;
                const tempY2 = tempY1 + layout.height - childMarginBottom;

                const w = Math.min(moveX2, tempX2) - Math.max(moveX1, tempX1);
                const h = Math.min(moveY2, tempY2) - Math.max(moveY1, tempY1);
                if (w <= 0 || h <= 0) continue;

                const overlapArea = w * h;
                const minArea = Math.min(layout.width * layout.height, moveArea);
                if (overlapArea < minArea * areaOverlapRatio) continue;

                this.move(curLayout.key, layout.key, vy, curLayout.y !== layout.y);
                break;
            }
        }

        const preLeft = selectedPosition.left;
        const preTop = selectedPosition.top;

        const nextLeft = parseInt(selectedOriginLayout.x + dx + 0.5);
        const nextTop = parseInt(selectedPosition.initTop + (moveY - y0) + 0.5);

        if (preLeft !== nextLeft || preTop !== nextTop) {
            this.setState({
                selectedPosition: { ...selectedPosition, left: nextLeft, top: nextTop },
            });
        }
    };

    move = (fromKey, toKey, vy, isDiffline) => {
        this.isUpdating = true;
        const { onDataChange, dataSource } = this.props;

        const length = dataSource.length;
        const fromIndex = this.keyToIndexMap.get(fromKey);
        const toIndex = this.keyToIndexMap.get(toKey);

        if (
            fromIndex < 0 ||
            fromIndex >= length ||
            toIndex < 0 ||
            toIndex >= length ||
            fromIndex === toIndex
        ) {
            this.isUpdating = false;
            return;
        }

        if (
            this.preMoveKeyObj &&
            this.preMoveKeyObj.fromKey === fromKey &&
            this.preMoveKeyObj.toKey === toKey &&
            isDiffline &&
            ((toIndex - fromIndex > 0 && vy <= 0.01) || (toIndex - fromIndex < 0 && vy >= -0.01))
        ) {
            this.isUpdating = false;
            return;
        }

        this.preMoveKeyObj = { fromKey, toKey };

        const newDataSource = [...dataSource];
        const [deleteItem] = newDataSource.splice(fromIndex, 1);

        // Much more visible layout animation for reflow
        LayoutAnimation.configureNext({
            duration: ANIM_DURATION,
            update: { type: LayoutAnimation.Types.easeInEaseOut },
            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        });

        newDataSource.splice(toIndex, 0, deleteItem);

        onDataChange?.(newDataSource, () => {
            setTimeout(() => {
                this.isUpdating = false;
            }, ANIM_DURATION);
        });
    };

    endTouch = () => {
        this.isHasMove = false;
        this.initTag();
        if (this.props.onDragEnd) this.props.onDragEnd();

        this.isMovePanResponder = false;

        this.setState({
            selectedItem: null,
            selectedKey: null,
            selectedOriginLayout: null,
            selectedPosition: null,
            scrollEnabled: true,
        });
    };

    onPressOut() {
        this.isScaleRecovery = setTimeout(() => {
            if (this.isMovePanResponder && !this.isHasMove) this.endTouch();
        }, 220);
    }

    _setLayoutData = (key, event) => {
        this.layoutMap.set(key, { ...event.nativeEvent.layout, key });
    };

    scrollTo = (height, animated = true) => {
        if (this.curScrollData) {
            if (this.autoObj.forceScrollStatus < 0 && this.curScrollData.offsetY <= 0) {
                this.autoObj.scrollDy = 0;
                return;
            } else if (
                this.autoObj.forceScrollStatus > 0 &&
                this.curScrollData.windowHeight + this.curScrollData.offsetY >= this.curScrollData.totalHeight
            ) {
                this.autoObj.scrollDy = this.curScrollData.offsetY;
                return;
            }
            this.curScrollData.hasScroll = false;
        }
        this.scrollRef?.scrollTo({ x: 0, y: height, animated });
    };

    onScrollListener = (event) => {
        const nativeEvent = event.nativeEvent;
        this.curScrollData = {
            totalHeight: nativeEvent.contentSize.height,
            windowHeight: nativeEvent.layoutMeasurement.height,
            offsetY: nativeEvent.contentOffset.y,
            hasScroll: true,
        };
        if (nativeEvent.contentOffset.y !== 0) this.isHasMeasure = true;
        this.props.onScrollListener?.(event);
    };

    render() {
        const { selectedItem, selectedPosition, scrollEnabled } = this.state;
        const { dataSource, keyExtractor, renderItem, movedWrapStyle } = this.props;

        return (
            <View style={styles.box}>
                {selectedPosition && (
                    <View
                        style={[
                            movedWrapStyle,
                            {
                                left: selectedPosition.left,
                                top: selectedPosition.top,
                                position: 'absolute',
                                zIndex: 999,
                            },
                        ]}
                    >
                        {renderItem(selectedItem, null, true)}
                    </View>
                )}

                <ScrollView
                    bounces={false}
                    scrollEventThrottle={1}
                    scrollIndicatorInsets={this.props.scrollIndicatorInsets}
                    ref={(scrollRef) => {
                        this.props.onScrollRef?.(scrollRef);
                        this.scrollRef = scrollRef;
                        return this.scrollRef;
                    }}
                    scrollEnabled={scrollEnabled}
                    onScroll={this.onScrollListener}
                    style={styles.scroll}
                >
                    {this.props.renderHeaderView ? this.props.renderHeaderView : null}

                    <View style={styles.container}>
                        {dataSource.map((item, index) => {
                            const key = keyExtractor(item, index);
                            this.keyToIndexMap.set(key, index);

                            return (
                                <View
                                    key={key}
                                    style={styles.itemWrap}
                                    {...this._panResponder.panHandlers}
                                    onLayout={(event) => this._setLayoutData(key, event)}
                                >
                                    {renderItem(item, index, false)}
                                </View>
                            );
                        })}
                    </View>

                    {this.props.renderBottomView ? this.props.renderBottomView : null}
                </ScrollView>
            </View>
        );
    }
}

AnySizeDragSortableView.propTypes = {
    dataSource: PropTypes.array.isRequired,
    keyExtractor: PropTypes.func.isRequired,
    renderItem: PropTypes.func.isRequired,
    onDataChange: PropTypes.func,
    headerViewHeight: PropTypes.number,
    renderBottomView: PropTypes.element,
    bottomViewHeight: PropTypes.number,
    renderHeaderView: PropTypes.element,
    autoThrottle: PropTypes.number,
    onDragEnd: PropTypes.func,
    autoThrottleDuration: PropTypes.number,
    scrollIndicatorInsets: PropTypes.shape({
        top: PropTypes.number,
        left: PropTypes.number,
        bottom: PropTypes.number,
        right: PropTypes.number,
    }),
    onScrollListener: PropTypes.func,
    onScrollRef: PropTypes.func,
    areaOverlapRatio: PropTypes.number,
    movedWrapStyle: PropTypes.object,
    childMarginTop: PropTypes.number,
    childMarginBottom: PropTypes.number,
    childMarginLeft: PropTypes.number,
    childMarginRight: PropTypes.number,
};

AnySizeDragSortableView.defaultProps = {
    areaOverlapRatio: 0.55,
    autoThrottle: 2,
    autoThrottleDuration: 10,
    scrollIndicatorInsets: { top: 0, left: 0, bottom: 0, right: 1 },
    headerViewHeight: 0,
    bottomViewHeight: 0,
    movedWrapStyle: { zIndex: 999 },
    childMarginTop: 8,
    childMarginBottom: 8,
    childMarginLeft: 2,
    childMarginRight: 2,
};

const styles = StyleSheet.create({
    box: {
        flex: 1,
        position: 'relative',
    },
    scroll: {
        flex: 1,
    },
    // IMPORTANT: vertical list (no wrap)
    container: {
        flexDirection: 'column',
        width: '100%',
    },
    itemWrap: {
        width: '100%',
    },
});
