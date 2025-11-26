import React, { useState, useEffect } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { COLORS, FONTS } from '../constants/theme';

const Timer = ({ startTime, style, textStyle }) => {
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
        <View style={[styles.container, style]}>
            <Text style={[styles.timerText, textStyle]}>{formatTime(elapsed)}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    timerText: {
        fontSize: 16,
        fontFamily: FONTS.medium,
        color: COLORS.text,
        fontVariant: ['tabular-nums'],
    },
});

export default Timer;
