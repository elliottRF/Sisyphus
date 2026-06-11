import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FONTS } from '../constants/theme';

/**
 * Global error boundary. Catches render crashes anywhere in the app and shows
 * a recovery screen instead of a blank white screen. The in-progress workout
 * is autosaved to AsyncStorage ('@currentWorkout'), so tapping "Reload"
 * remounts the app with the workout intact.
 */
class ErrorBoundary extends React.Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        if (__DEV__) {
            console.error('ErrorBoundary caught:', error, info?.componentStack);
        }
    }

    handleReset = () => {
        this.setState({ error: null });
    };

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <View style={styles.container}>
                <Text style={styles.title}>Something went wrong</Text>
                <Text style={styles.subtitle}>
                    Don't worry — your workout is saved. Reload to pick up where you left off.
                </Text>
                <TouchableOpacity style={styles.button} onPress={this.handleReset} activeOpacity={0.8}>
                    <Text style={styles.buttonText}>Reload</Text>
                </TouchableOpacity>
                {__DEV__ && (
                    <Text style={styles.debug} numberOfLines={6}>
                        {String(this.state.error?.message || this.state.error)}
                    </Text>
                )}
            </View>
        );
    }
}

// Static styles (theme context may itself have crashed, so stay self-contained)
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#151517',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 22,
        fontFamily: FONTS.bold,
        marginBottom: 12,
    },
    subtitle: {
        color: '#A0A0A8',
        fontSize: 15,
        fontFamily: FONTS.regular,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 28,
    },
    button: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 36,
        paddingVertical: 14,
        borderRadius: 14,
    },
    buttonText: {
        color: '#151517',
        fontSize: 16,
        fontFamily: FONTS.semiBold,
    },
    debug: {
        marginTop: 24,
        color: '#ff7675',
        fontSize: 12,
        textAlign: 'center',
    },
});

export default ErrorBoundary;
