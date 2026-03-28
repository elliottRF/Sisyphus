import React, { useState, useEffect } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { FONTS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const Timer = ({ startTime, style, textStyle }) => {
    const { theme } = useTheme();
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date().getTime();
            const start = new Date(startTime).getTime();
            setElapsed(Math.floor((now - start) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [startTime]);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h > 0 ? h + ':' : ''}${m < 10 && h > 0 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
        <View style={[
            styles.container,
            {
                backgroundColor: theme.overlayMedium,
                borderColor: theme.overlayBorder,
            },
            style
        ]}>
            <Text style={[
                styles.timerText,
                { color: theme.text },
                textStyle
            ]}>{formatTime(elapsed)}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 1,
    },
    timerText: {
        fontSize: 16,
        fontFamily: FONTS.medium,
        fontVariant: ['tabular-nums'],
    },
});

export default Timer;
