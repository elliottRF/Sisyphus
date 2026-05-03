import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, Dimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withDelay,
} from 'react-native-reanimated';
import { muscleMapping, majorMuscles } from '../constants/muscles';
import { FONTS } from '../constants/theme';

const { width: SW, height: SH } = Dimensions.get('window');
const SPRING = { damping: 28, stiffness: 280, mass: 0.85 };
const CORNER = 26;

const chunkArray = (arr, size) => {
    const result = [];
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
    return result;
};

const shortMuscleNames = {
    "Upper Back": "Back",
    "Lower Back": "L. Back",
    "Shoulders": "Delts",
    "Forearms": "Forearms",
    "Hamstrings": "Hams",
    "Quadriceps": "Quads",
    "Glutes": "Glutes",
};

// ─── Overlay ──────────────────────────────────────────────────────────────────

const MuscleDetailOverlay = ({ card, onClose, theme, insets }) => {
    const { x, y, w, h, bg, color, percent, displayName, exercises } = card;

    const left = useSharedValue(x);
    const top = useSharedValue(y);
    const width = useSharedValue(w);
    const height = useSharedValue(h);
    const radius = useSharedValue(12);
    const contentOpacity = useSharedValue(0);
    const scrimOpacity = useSharedValue(0);

    const dismiss = React.useCallback(() => {
        contentOpacity.value = withTiming(0, { duration: 80 });
        scrimOpacity.value = withTiming(0, { duration: 320 });
        left.value = withSpring(x, SPRING);
        top.value = withSpring(y, SPRING);
        width.value = withSpring(w, SPRING);
        height.value = withSpring(h, SPRING);
        radius.value = withSpring(12, SPRING);
        setTimeout(onClose, 360);
    }, []);

    React.useEffect(() => {
        scrimOpacity.value = withTiming(1, { duration: 280 });
        left.value = withSpring(0, SPRING);
        top.value = withSpring(0, SPRING);
        width.value = withSpring(SW, SPRING);
        height.value = withSpring(SH, SPRING);
        radius.value = withSpring(CORNER, SPRING);
        contentOpacity.value = withDelay(200, withTiming(1, { duration: 200 }));
    }, []);

    const scrimStyle = useAnimatedStyle(() => ({
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.surface,
        opacity: scrimOpacity.value,
    }));

    const cardStyle = useAnimatedStyle(() => ({
        position: 'absolute',
        left: left.value,
        top: top.value,
        width: width.value,
        height: height.value,
        borderRadius: radius.value,
        backgroundColor: bg,
        overflow: 'hidden',
    }));

    const contentStyle = useAnimatedStyle(() => ({
        flex: 1,
        opacity: contentOpacity.value,
    }));

    const readiness = Number(percent);
    const readinessLabel =
        readiness <= 60 ? 'Fatigued' :
            readiness < 80 ? 'Recovering' :
                'Ready';

    const pillBg = `${color}20`;

    return (
        <Modal transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
            <Animated.View style={scrimStyle} />
            <Animated.View style={cardStyle}>
                <Animated.View style={contentStyle}>
                    <ScrollView
                        contentContainerStyle={{
                            paddingTop: insets.top + 16,
                            paddingBottom: insets.bottom + 40,
                            paddingHorizontal: 28,
                        }}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Close button */}
                        <Pressable
                            onPress={dismiss}
                            hitSlop={16}
                            style={{
                                alignSelf: 'flex-end',
                                width: 34,
                                height: 34,
                                borderRadius: 17,
                                backgroundColor: pillBg,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: 28,
                            }}
                        >
                            <Feather name="x" size={16} color={color} />
                        </Pressable>

                        {/* Label + name */}
                        <Text style={{
                            fontSize: 12,
                            fontFamily: FONTS.bold,
                            color,
                            opacity: 0.6,
                            letterSpacing: 1.8,
                            textTransform: 'uppercase',
                            marginBottom: 6,
                        }}>
                            Muscle
                        </Text>
                        <Text style={{
                            fontSize: 46,
                            fontFamily: FONTS.bold,
                            color,
                            letterSpacing: -1.5,
                            marginBottom: 4,
                        }}>
                            {displayName}
                        </Text>

                        {/* Status pill */}
                        <View style={{ flexDirection: 'row', marginBottom: 36 }}>
                            <View style={{
                                paddingHorizontal: 12,
                                paddingVertical: 5,
                                borderRadius: 20,
                                backgroundColor: pillBg,
                            }}>
                                <Text style={{
                                    fontSize: 13,
                                    fontFamily: FONTS.semiBold,
                                    color,
                                }}>
                                    {readinessLabel}
                                </Text>
                            </View>
                        </View>

                        {/* Big percent */}
                        <Text style={{
                            fontSize: 100,
                            fontFamily: FONTS.bold,
                            color,
                            letterSpacing: -5,
                            lineHeight: 100,
                            marginBottom: 2,
                        }}>
                            {readiness}
                            <Text style={{ fontSize: 40, letterSpacing: -1 }}>%</Text>
                        </Text>
                        <Text style={{
                            fontSize: 14,
                            color,
                            opacity: 0.6,
                            fontFamily: FONTS.medium,
                            marginBottom: 20,
                        }}>
                            recovered
                        </Text>

                        {/* Progress bar */}
                        <View style={{
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: pillBg,
                            overflow: 'hidden',
                            marginBottom: 44,
                        }}>
                            <View style={{
                                width: `${readiness}%`,
                                height: '100%',
                                borderRadius: 3,
                                backgroundColor: color,
                            }} />
                        </View>

                        {/* Contributing exercises */}
                        {exercises.length > 0 && (
                            <>
                                <Text style={{
                                    fontSize: 12,
                                    fontFamily: FONTS.bold,
                                    color,
                                    opacity: 0.6,
                                    letterSpacing: 1.8,
                                    textTransform: 'uppercase',
                                    marginBottom: 16,
                                }}>
                                    Contributing Exercises
                                </Text>

                                {exercises.map((ex, i) => (
                                    <View key={i} style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        paddingVertical: 14,
                                        borderTopWidth: 1,
                                        borderTopColor: pillBg,
                                    }}>
                                        <View style={{
                                            width: 34,
                                            height: 34,
                                            borderRadius: 10,
                                            backgroundColor: pillBg,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginRight: 14,
                                        }}>
                                            <Feather
                                                name={ex.isPrimary ? 'zap' : 'activity'}
                                                size={15}
                                                color={color}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{
                                                fontSize: 15,
                                                fontFamily: FONTS.semiBold,
                                                color,
                                                marginBottom: 2,
                                            }}>
                                                {ex.name}
                                            </Text>
                                            <Text style={{
                                                fontSize: 12,
                                                fontFamily: FONTS.medium,
                                                color,
                                                opacity: 0.6,
                                            }}>
                                                {ex.isPrimary ? 'Primary' : 'Accessory'} · {ex.sets} {ex.sets === 1 ? 'set' : 'sets'} · {ex.daysAgo === 0 ? 'Today' : ex.daysAgo === 1 ? 'Yesterday' : `${ex.daysAgo}d ago`}
                                            </Text>
                                        </View>
                                    </View>
                                ))}

                                <View style={{ borderTopWidth: 1, borderTopColor: pillBg, marginBottom: 36 }} />
                            </>
                        )}

                        {/* Advice */}
                        <Text style={{
                            fontSize: 12,
                            fontFamily: FONTS.bold,
                            color,
                            opacity: 0.6,
                            letterSpacing: 1.8,
                            textTransform: 'uppercase',
                            marginBottom: 12,
                        }}>
                            Advice
                        </Text>
                        <Text style={{
                            fontSize: 16,
                            lineHeight: 25,
                            color,
                            opacity: 0.85,
                            fontFamily: FONTS.medium,
                        }}>
                            {readiness <= 60
                                ? `${displayName} is still under significant fatigue. Prioritise rest or keep volume very low if you must train today.`
                                : readiness < 80
                                    ? `${displayName} is on its way back. One more rest day will have it fully recovered for a quality session.`
                                    : `${displayName} is fully recovered and ready to train hard today.`}
                        </Text>
                    </ScrollView>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

// ─── Individual card ──────────────────────────────────────────────────────────

const MuscleReadinessBox = ({ muscle, percent, styles, onPress, usageData }) => {
    const { theme } = useTheme();
    const ref = useRef(null);
    const displayName = shortMuscleNames[muscle] || muscle;

    let color, bg;
    if (percent <= 60) {
        color = theme.primary;
        bg = theme.overlayInputFocused;
    } else if (percent < 80) {
        color = theme.secondary;
        bg = `${theme.secondary}30`;
    } else {
        color = theme.success;
        bg = 'rgba(52,199,89,0.15)';
    }

    const getContributingExercises = () => {
        const muscleDef = majorMuscles.find(m => m.label === muscle);
        if (!muscleDef || !usageData?.length) return [];
        const now = new Date();

        return usageData
            .filter(ex => {
                const targets = (ex.targetMuscle || '').split(',').map(m => m.trim()).filter(Boolean);
                const accessories = (ex.accessoryMuscles || '').split(',').map(m => m.trim()).filter(Boolean);
                const matchesSlugs = (muscles) => muscles.some(m => {
                    const slug = muscleMapping[m] || m.toLowerCase();
                    return muscleDef.slugs.includes(slug);
                });
                return matchesSlugs(targets) || matchesSlugs(accessories);
            })
            .map(ex => {
                const targets = (ex.targetMuscle || '').split(',').map(m => m.trim()).filter(Boolean);
                const isPrimary = targets.some(m => {
                    const slug = muscleMapping[m] || m.toLowerCase();
                    return muscleDef.slugs.includes(slug);
                });
                const daysAgo = Math.floor((now - new Date(ex.date)) / (1000 * 60 * 60 * 24));
                return { name: ex.name, sets: parseInt(ex.sets, 10) || 0, daysAgo, isPrimary };
            })
            .sort((a, b) => (b.isPrimary - a.isPrimary) || a.daysAgo - b.daysAgo);
    };

    const handlePress = () => {
        ref.current?.measure((_, __, w, h, pageX, pageY) => {
            onPress({
                x: pageX, y: pageY, w, h,
                bg, color, percent, displayName,
                exercises: getContributingExercises(),
            });
        });
    };

    return (
        <Pressable ref={ref} onPress={handlePress} style={{ flex: 1 }}>
            <View style={[styles.muscleBox, { backgroundColor: bg }]}>
                <Text style={[styles.muscleName, { color }]} numberOfLines={1}>
                    {displayName}
                </Text>
                <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBarFill, { width: `${percent}%`, backgroundColor: color }]} />
                </View>
            </View>
        </Pressable>
    );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const ReadinessCard = ({ allMusclesSorted, cardWidth, styles, usageData }) => {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const [activeCard, setActiveCard] = useState(null);

    return (
        <>
            <View style={[styles.readinessStickyCard, { width: cardWidth, minHeight: 400 }]}>
                <View style={styles.readinessHeader}>
                    <Feather name="activity" size={14} color={theme.primary} />
                    <Text style={styles.readinessTitle}>Readiness</Text>
                </View>
                <ScrollView style={styles.readinessScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.muscleGrid}>
                        {chunkArray(allMusclesSorted, 2).map((row, rowIndex) => (
                            <View key={rowIndex} style={styles.muscleRow}>
                                {row.map((item) => (
                                    <MuscleReadinessBox
                                        key={item.label}
                                        muscle={item.label}
                                        percent={item.percent}
                                        styles={styles}
                                        onPress={setActiveCard}
                                        usageData={usageData}
                                    />
                                ))}
                            </View>
                        ))}
                    </View>
                </ScrollView>
            </View>

            {activeCard && (
                <MuscleDetailOverlay
                    key={activeCard.displayName}
                    card={activeCard}
                    onClose={() => setActiveCard(null)}
                    theme={theme}
                    insets={insets}
                />
            )}
        </>
    );
};

export default ReadinessCard;