import React, { useRef, useState, useImperativeHandle, forwardRef } from 'react';
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
    "Back": "Back",
    "Lower Back": "L. Back",
    "Shoulders": "Delts",
    "Forearms": "Forearms",
    "Hamstrings": "Hams",
    "Quadriceps": "Quads",
    "Glutes": "Glutes",
};

// ─── Overlay ──────────────────────────────────────────────────────────────────

const MuscleDetailOverlay = ({ card, onClose, theme, insets }) => {
    const { x, y, w, h, bg, color, percent, displayName, fullName, exercises, accessoryWeight } = card;

    const overlayTitle = fullName || displayName;

    const left = useSharedValue(x);
    const top = useSharedValue(y);
    const width = useSharedValue(w);
    const height = useSharedValue(h);
    const radius = useSharedValue(12);
    const contentOpacity = useSharedValue(0);
    const scrimOpacity = useSharedValue(0);
    const cardOpacity = useSharedValue(1);

    const dismiss = React.useCallback(() => {
        contentOpacity.value = withTiming(0, { duration: 250 });
        scrimOpacity.value = withTiming(0, { duration: 320 });
        cardOpacity.value = withDelay(150, withTiming(0, { duration: 250 }));
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
        opacity: cardOpacity.value,
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

    // Binary-search for time until readiness hits 80% (the green threshold).
    // score = min(SETS_CAP, Σ sets_i * weight_i * max(0, 1 - hoursTotal_i / RECOVERY_WINDOW))
    // 80% readiness  ⟺  score ≤ TARGET_SCORE = (1 - 0.8) * 6 = 1.2
    const RECOVERY_WINDOW_HOURS = 96; // 4 days
    const SETS_CAP = 6;
    const TARGET_SCORE = (1 - 80 / 100) * SETS_CAP; // 1.2
    const aw = accessoryWeight ?? 0.5;

    const scoreAt = (tFuture) => {
        const slugs = exercises[0]?.slugsInGroup;

        if (!slugs || slugs.length <= 1) {
            // Single-slug muscle (e.g. Chest, Biceps): simple weighted sum + cap.
            // Matches index.jsx exactly.
            const raw = exercises.reduce((sum, ex) => {
                const hoursAgoNow = (Date.now() - ex.timestamp) / (1000 * 60 * 60);
                const decay = Math.max(0, 1 - (hoursAgoNow + tFuture) / RECOVERY_WINDOW_HOURS);
                return sum + ex.sets * (ex.isPrimary ? 1 : aw) * decay;
            }, 0);
            return Math.min(SETS_CAP, raw);
        }

        // Multi-slug muscle (e.g. Back = upper-back + trapezius, Abs = abs + obliques):
        // index.jsx accumulates each slug independently then takes the max.
        // We replicate that here so the timer is accurate.
        const slugScores = slugs.map(slug => {
            const raw = exercises.reduce((sum, ex) => {
                const hoursAgoNow = (Date.now() - ex.timestamp) / (1000 * 60 * 60);
                const decay = Math.max(0, 1 - (hoursAgoNow + tFuture) / RECOVERY_WINDOW_HOURS);
                const isPrimary = ex.targetSlugsInGroup?.includes(slug);
                const isAccessory = ex.accessorySlugsInGroup?.includes(slug);
                if (isPrimary) return sum + ex.sets * decay;
                if (isAccessory) return sum + ex.sets * decay * aw;
                return sum;
            }, 0);
            return Math.min(SETS_CAP, raw);
        });

        return Math.max(...slugScores);
    };

    let hoursToTarget = 0;
    if (readiness < 80) {
        let lo = 0, hi = RECOVERY_WINDOW_HOURS;
        for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2;
            if (scoreAt(mid) > TARGET_SCORE) lo = mid;
            else hi = mid;
        }
        hoursToTarget = hi;
    }

    const formatRecovery = (hrs) => {
        if (hrs <= 0) return 'Ready now';
        if (hrs < 1) return '< 1 hour';
        if (hrs < 24) {
            const h = Math.floor(hrs);
            const m = Math.round((hrs - h) * 60);
            return m > 0 ? `${h}h ${m}m` : `${h}h`;
        }
        const d = Math.floor(hrs / 24);
        const h = Math.round(hrs % 24);
        return h > 0 ? `${d}d ${h}h` : `${d}d`;
    };
    const recoveryLabel = formatRecovery(hoursToTarget);

    return (
        <Modal transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
            <Animated.View style={scrimStyle} />
            <Animated.View style={cardStyle}>
                <Animated.View style={contentStyle}>
                    {/* Close button — absolute so it doesn't push content down */}
                    <Pressable
                        onPress={dismiss}
                        hitSlop={16}
                        style={{
                            position: 'absolute',
                            top: insets.top + 12,
                            right: 20,
                            zIndex: 10,
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            backgroundColor: pillBg,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Feather name="x" size={16} color={color} />
                    </Pressable>

                    <ScrollView
                        contentContainerStyle={{
                            paddingTop: insets.top + 16,
                            paddingBottom: insets.bottom + 40,
                            paddingHorizontal: 28,
                        }}
                        showsVerticalScrollIndicator={false}
                    >

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
                            {overlayTitle}
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
                            marginBottom: 20,
                        }}>
                            <View style={{
                                width: `${readiness}%`,
                                height: '100%',
                                borderRadius: 3,
                                backgroundColor: color,
                            }} />
                        </View>

                        {/* Time to recovery */}
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: pillBg,
                            borderRadius: 14,
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            marginBottom: 36,
                            gap: 10,
                        }}>
                            <Feather name="clock" size={14} color={color} />
                            <Text style={{
                                fontSize: 13,
                                fontFamily: FONTS.medium,
                                color,
                                opacity: 0.7,
                                flex: 1,
                            }}>
                                {hoursToTarget <= 0 ? 'Ready to train' : 'Ready to train in'}
                            </Text>
                            <Text style={{
                                fontSize: 14,
                                fontFamily: FONTS.bold,
                                color,
                            }}>
                                {recoveryLabel}
                            </Text>
                        </View>

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
                            marginBottom: 44,
                        }}>
                            {(() => {
                                const isPlural = overlayTitle.toLowerCase().endsWith('s');
                                const verb = isPlural ? 'are' : 'is';
                                const pronoun = isPlural ? 'their' : 'its';
                                const objectPronoun = isPlural ? 'them' : 'it';

                                if (readiness <= 60) {
                                    return `${overlayTitle} ${verb} significantly fatigued. Prioritise rest or keep volume very low if you must train today.`;
                                } else if (readiness < 80) {
                                    return `${overlayTitle} ${verb} on ${pronoun} way back. One more rest day will have ${objectPronoun} recovered for a quality session.`;
                                } else {
                                    return `${overlayTitle} ${verb} fully recovered and ready to train hard today.`;
                                }
                            })()}
                        </Text>

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
                                                {ex.isPrimary ? 'Primary' : 'Secondary'} · {ex.sets} {ex.sets === 1 ? 'set' : 'sets'} · {ex.daysAgo === 0 ? 'Today' :
                                                    ex.daysAgo === 1 ? 'Yesterday' :
                                                        ex.daysAgo === 2 ? '2 days ago' :
                                                            `${ex.daysAgo}d ago`}
                                            </Text>
                                        </View>
                                    </View>
                                ))}

                                <View style={{ borderTopWidth: 1, borderTopColor: pillBg }} />
                            </>
                        )}
                    </ScrollView>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

// ─── Individual card ──────────────────────────────────────────────────────────

const MuscleReadinessBox = ({ muscle, percent, styles, onPress, usageData }) => {
    const { theme, accessoryWeight } = useTheme();
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
                const accessories = (ex.accessoryMuscles || '').split(',').map(m => m.trim()).filter(Boolean);

                // Track which of this group's slugs this exercise specifically targets/accessories
                // so `scoreAt` can replicate index.jsx's per-slug max logic
                const targetSlugsInGroup = targets
                    .map(m => muscleMapping[m] || m.toLowerCase())
                    .filter(s => muscleDef.slugs.includes(s));
                const accessorySlugsInGroup = accessories
                    .map(m => muscleMapping[m] || m.toLowerCase())
                    .filter(s => muscleDef.slugs.includes(s));

                const isPrimary = targetSlugsInGroup.length > 0;
                const exDate = new Date(ex.date);
                const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const exMidnight = new Date(exDate.getFullYear(), exDate.getMonth(), exDate.getDate());
                const daysAgo = Math.round((todayMidnight - exMidnight) / (1000 * 60 * 60 * 24)); return {
                    name: ex.name,
                    sets: parseInt(ex.sets, 10) || 0,
                    daysAgo,
                    isPrimary,
                    timestamp: exDate.getTime(),
                    slugsInGroup: muscleDef.slugs,
                    targetSlugsInGroup,
                    accessorySlugsInGroup,
                };
            })
            .sort((a, b) => b.timestamp - a.timestamp);
    };

    const handlePress = () => {
        ref.current?.measure((_, __, w, h, pageX, pageY) => {
            onPress({
                x: pageX, y: pageY, w, h,
                bg, color, percent, displayName, fullName: muscle,
                exercises: getContributingExercises(),
                accessoryWeight,
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

const ReadinessCard = forwardRef(({ allMusclesSorted, cardWidth, styles, usageData }, ref) => {
    const { theme, accessoryWeight } = useTheme();
    const insets = useSafeAreaInsets();
    const [activeCard, setActiveCard] = useState(null);

    // Allows index.jsx to open the overlay for a given muscle label programmatically
    // (triggered by onBodyPartPress on the body highlighter).
    useImperativeHandle(ref, () => ({
        openMuscleByLabel: (label) => {
            const muscleItem = allMusclesSorted.find(m => m.label === label);
            if (!muscleItem) return;

            const { percent } = muscleItem;
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

            const muscleDef = majorMuscles.find(m => m.label === label);
            const now = new Date();
            const exercises = muscleDef && usageData?.length
                ? usageData
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
                        const accessories = (ex.accessoryMuscles || '').split(',').map(m => m.trim()).filter(Boolean);
                        const targetSlugsInGroup = targets.map(m => muscleMapping[m] || m.toLowerCase()).filter(s => muscleDef.slugs.includes(s));
                        const accessorySlugsInGroup = accessories.map(m => muscleMapping[m] || m.toLowerCase()).filter(s => muscleDef.slugs.includes(s));
                        const isPrimary = targetSlugsInGroup.length > 0;
                        const exDate = new Date(ex.date);
                        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        const exMidnight = new Date(exDate.getFullYear(), exDate.getMonth(), exDate.getDate());
                        const daysAgo = Math.round((todayMidnight - exMidnight) / (1000 * 60 * 60 * 24));
                        return { name: ex.name, sets: parseInt(ex.sets, 10) || 0, daysAgo, isPrimary, timestamp: exDate.getTime(), slugsInGroup: muscleDef.slugs, targetSlugsInGroup, accessorySlugsInGroup };
                    })
                    .sort((a, b) => b.timestamp - a.timestamp)
                : [];

            // Expand from centre of screen since there's no tapped DOM node
            const { width: W, height: H } = Dimensions.get('window');
            const SIZE = 48;
            setActiveCard({
                x: (W - SIZE) / 2,
                y: (H - SIZE) / 2,
                w: SIZE,
                h: SIZE,
                bg, color, percent,
                displayName: label,
                fullName: label,
                exercises,
                accessoryWeight,
            });
        },
    }), [allMusclesSorted, usageData, theme, accessoryWeight]);

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
});

export default ReadinessCard;