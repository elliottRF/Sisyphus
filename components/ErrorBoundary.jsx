import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONTS } from '../constants/theme';

/**
 * Global error boundary. Catches render crashes anywhere in the app and shows
 * a recovery screen instead of a blank white screen. The in-progress workout
 * is autosaved to AsyncStorage ('@currentWorkout'), so tapping "Reload"
 * remounts the app with the workout intact.
 */
class ErrorBoundary extends React.Component {
    // resetCount doubles as the subtree key, so "Reload" genuinely remounts the
    // app rather than just clearing the error and letting React reconcile the
    // same tree (which kept every component's state — including whatever state
    // caused the crash — and often crashed straight back).
    state = { error: null, resetCount: 0, clearing: false };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        if (__DEV__) {
            console.error('ErrorBoundary caught:', error, info?.componentStack);
        }
    }

    handleReset = () => {
        this.setState(prev => ({ error: null, resetCount: prev.resetCount + 1 }));
    };

    // Escape hatch for a crash that survives a reload. A render crash driven by
    // the restored workout would otherwise reload straight back into itself,
    // leaving no way out of the app but clearing its data (losing all history).
    // This drops only the in-progress workout — the same two keys the normal
    // discard path removes — and never touches the database.
    handleDiscardWorkout = async () => {
        this.setState({ clearing: true });
        try {
            await AsyncStorage.multiRemove(['@currentWorkout', '@prMode']);
        } catch (e) {
            // Nothing useful to do here: we're already in the failure path, and
            // remounting is still worth attempting.
        }
        this.setState(prev => ({ error: null, clearing: false, resetCount: prev.resetCount + 1 }));
    };

    render() {
        if (!this.state.error) {
            return <React.Fragment key={this.state.resetCount}>{this.props.children}</React.Fragment>;
        }

        // Only offered once a reload has already been tried and failed.
        const reloadFailed = this.state.resetCount > 0;

        return (
            <View style={styles.container}>
                <Text style={styles.title}>Something went wrong</Text>
                <Text style={styles.subtitle}>
                    Don't worry — your workout is saved. Reload to pick up where you left off.
                </Text>
                <TouchableOpacity style={styles.button} onPress={this.handleReset} activeOpacity={0.8}>
                    <Text style={styles.buttonText}>Reload</Text>
                </TouchableOpacity>

                {reloadFailed && (
                    <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={this.handleDiscardWorkout}
                        activeOpacity={0.8}
                        disabled={this.state.clearing}
                    >
                        <Text style={styles.secondaryButtonText}>
                            {this.state.clearing ? 'Clearing…' : 'Discard in-progress workout'}
                        </Text>
                    </TouchableOpacity>
                )}
                {reloadFailed && (
                    <Text style={styles.secondaryHint}>
                        Reloading didn't help. Discarding the unsaved workout usually
                        clears it. Your saved history is not affected.
                    </Text>
                )}
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
    secondaryButton: {
        marginTop: 14,
        paddingHorizontal: 28,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#4A4A52',
    },
    secondaryButtonText: {
        color: '#A0A0A8',
        fontSize: 15,
        fontFamily: FONTS.medium,
    },
    secondaryHint: {
        marginTop: 14,
        color: '#6E6E78',
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center',
        fontFamily: FONTS.regular,
        maxWidth: 300,
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
