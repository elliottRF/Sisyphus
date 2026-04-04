import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';
import { Animated } from 'react-native';

const TabBarContext = createContext();

export const TAB_BAR_HEIGHT = 85; // pill height ~72 + bottom padding 13

export const TabBarProvider = ({ children }) => {
    const lastScrollY = useRef(0);
    const translateY = useRef(new Animated.Value(0)).current;
    const translateYValue = useRef(0);

    useEffect(() => {
        const id = translateY.addListener(({ value }) => {
            translateYValue.current = value;
        });
        return () => translateY.removeListener(id);
    }, []);

    const onScroll = useCallback((event) => {
        const currentY = event.nativeEvent.contentOffset.y;
        const delta = currentY - lastScrollY.current;
        lastScrollY.current = currentY;

        // Snap bar back when rubber-banding at the top
        if (currentY < 10) {
            Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: false,
                bounciness: 0,
                speed: 20,
            }).start();
            return;
        }

        if (Math.abs(delta) < 2) return;

        const next = Math.max(
            0,
            Math.min(TAB_BAR_HEIGHT, translateYValue.current + delta)
        );
        translateY.setValue(next);
    }, []);

    // Call when a tab becomes focused so the bar is always visible on tab switch
    const resetTabBar = useCallback(() => {
        lastScrollY.current = 0;
        Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: false,
            bounciness: 0,
            speed: 20,
        }).start();
    }, []);

    return (
        <TabBarContext.Provider value={{ translateY, onScroll, resetTabBar }}>
            {children}
        </TabBarContext.Provider>
    );
};

export const useTabBar = () => useContext(TabBarContext);
