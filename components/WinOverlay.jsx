import React from 'react';
import { View, Modal, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

// The full-screen trophy shown when a workout completes with showCelebration on.
//
// Lives in its own module and is loaded with React.lazy from the root layout on
// purpose: lottie-react-native plus the 115KB win.json it parses were being
// evaluated on every cold start for an overlay that almost never shows. Keeping
// the import here means Metro leaves both unexecuted until the first time the
// overlay is actually rendered.
const WinOverlay = ({ theme }) => (
    <Modal transparent visible animationType="fade">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }]}>
            <LottieView
                source={require('../assets/notifications/win.json')}
                autoPlay
                loop={false}
                style={{ width: 350, height: 350 }}
                colorFilters={[
                    // Main Cup and Stem (identifying 'Stand' as the stem/neck)
                    ...['Cup', 'Stand', 'Trophy', 'Group 1', 'Pre-comp 3'].map(keypath => ({
                        keypath,
                        color: theme.primary
                    })),
                    // Handles and Depth (Making them noticeably darker for premium definition)
                    ...['Cup 2', 'Cup 3', 'Shape Layer 1', 'Shape Layer 2', 'Shape Layer 3', 'Shape Layer 4', 'Shape Layer 5', 'Shape Layer 6', 'Shape Layer 7'].map(keypath => ({
                        keypath,
                        color: theme.primaryDark || theme.primary
                    })),
                    // Stars (Bright White for premium shine)
                    ...['Star', 'Star 2', 'Star 3', 'Star 4', 'Star 4 :M'].map(keypath => ({
                        keypath,
                        color: '#FFFFFF'
                    })),
                    // The Base (Surface/Grounded)
                    ...['Black Stand', 'Black Stand 2', 'White Stand', 'White Stand 2', 'White Stand 3', 'White Stand 4', 'White Stand 4 :M'].map(keypath => ({
                        keypath,
                        color: theme.surface
                    })),
                    // Accents / Secondary parts (Sparkles/Highlights)
                    ...['Shape Layer 9', 'Shape Layer 10', 'Shape Layer 11', 'Shape Layer 12', 'Shape Layer 13', 'Shape Layer 14'].map(keypath => ({
                        keypath,
                        color: theme.secondary
                    })),
                ]}
            />
        </View>
    </Modal>
);

export default WinOverlay;
