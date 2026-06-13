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
import { FONTS, RADIUS, isLightTheme, getThemedShadow } from '../constants/theme';

// Status colour is reserved for the percent + progress bar; tiles themselves
// stay neutral so the grid reads calm. Red = fatigued, orange = recovering,
// green = ready.
const statusColor = (theme, percent) => {
    if (percent <= 60) return theme.danger;
    if (percent < 80) return theme.warning;
    return theme.success;
};

const { width: SW, height: SH } = Dimensions.get('window');
const SPRING = { damping: 28, stiffness: 280, mass: 0.85 };
const CORNER = 26;
const HORIZONTAL_ITEM_WIDTH = 88;

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

    const RECOVERY_WINDOW_HOURS = 96;
    const SETS_CAP = 6;
    const TARGET_SCORE = (1 - 80 / 100) * SETS_CAP;
    const aw = accessoryWeight ?? 0.5;

    const scoreAt = (tFuture) => {
        const slugs = exercises[0]?.slugsInGroup;

        if (!slugs || slugs.length <= 1) {
            const raw = exercises.reduce((sum, ex) => {
                const hoursAgoNow = (Date.now() - ex.timestamp) / (1000 * 60 * 60);
                const decay = Math.max(0, 1 - (hoursAgoNow + tFuture) / RECOVERY_WINDOW_HOURS);
                return sum + ex.sets * (ex.isPrimary ? 1 : aw) * decay;
            }, 0);
            return Math.min(SETS_CAP, raw);
        }

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
                                    return `${overlayTitle} ${verb} recovered and ready to train hard today.`;
                                }
                            })()}
                        </Text>

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

const MuscleReadinessBox = ({ muscle, percent, localStyles, onPress, usageData, horizontal, showPercentage = true }) => {
    const { theme, accessoryWeight } = useTheme();
    const ref = useRef(null);
    const displayName = shortMuscleNames[muscle] || muscle;

    const color = statusColor(theme, percent);
    const bg = theme.overlayInput;

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
                const daysAgo = Math.round((todayMidnight - exMidnight) / (1000 * 60 * 60 * 24));
                return {
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

    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));

    if (horizontal) {
        return (
            <Pressable
                ref={ref}
                onPress={handlePress}
                onPressIn={() => { scale.value = withSpring(0.94, SPRING); }}
                onPressOut={() => { scale.value = withSpring(1, SPRING); }}
            >
                <Animated.View style={[localStyles.muscleBoxHorizontal, { backgroundColor: bg }, animatedStyle]}>
                    <Text style={[localStyles.muscleNameHorizontal, { color: theme.text }]} numberOfLines={1}>
                        {displayName}
                    </Text>
                    {showPercentage && (
                        <Text style={[localStyles.musclePercentHorizontal, { color }]}>
                            {percent}%
                        </Text>
                    )}
                    <View style={localStyles.progressBarContainerHorizontal}>
                        <View style={[localStyles.progressBarFill, { width: `${percent}%`, backgroundColor: color }]} />
                    </View>
                </Animated.View>
            </Pressable>
        );
    }

    return (
        <Pressable
            ref={ref}
            onPress={handlePress}
            style={{ flex: 1 }}
            onPressIn={() => { scale.value = withSpring(0.96, SPRING); }}
            onPressOut={() => { scale.value = withSpring(1, SPRING); }}
        >
            <Animated.View style={[localStyles.muscleBox, { backgroundColor: bg }, animatedStyle]}>
                <Text style={[localStyles.muscleName, { color: theme.text }]} numberOfLines={1}>
                    {displayName}
                </Text>
                <View style={localStyles.progressBarContainer}>
                    <View style={[localStyles.progressBarFill, { width: `${percent}%`, backgroundColor: color }]} />
                </View>
            </Animated.View>
        </Pressable>
    );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const ReadinessCard = forwardRef(({ allMusclesSorted, cardWidth, usageData, horizontal, showPercentage = true }, ref) => {
    const { theme, accessoryWeight } = useTheme();
    const localStyles = getStyles(theme);
    const insets = useSafeAreaInsets();
    const [activeCard, setActiveCard] = useState(null);

    useImperativeHandle(ref, () => ({
        openMuscleByLabel: (label) => {
            const muscleItem = allMusclesSorted.find(m => m.label === label);
            if (!muscleItem) return;

            const { percent } = muscleItem;
            const color = statusColor(theme, percent);
            const bg = theme.overlayInput;

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

    // ─── Horizontal layout ────────────────────────────────────────────────────
    if (horizontal) {
        return (
            <>
                <View style={localStyles.readinessHorizontalCard}>
                    <View style={localStyles.readinessHeader}>
                        <Text style={localStyles.readinessTitle}>Readiness</Text>
                    </View>
                    {/* Pairs of muscle boxes as vertical columns, scrolled horizontally */}
                    <View style={localStyles.horizontalScrollContent}>
                        {chunkArray(allMusclesSorted, 3).map((pair, colIndex) => (
                            <View key={colIndex} style={localStyles.horizontalColumn}>
                                {pair.map((item) => (
                                    <MuscleReadinessBox
                                        key={item.label}
                                        muscle={item.label}
                                        percent={item.percent}
                                        localStyles={localStyles}
                                        onPress={setActiveCard}
                                        usageData={usageData}
                                        horizontal
                                        showPercentage={showPercentage}
                                    />
                                ))}
                            </View>
                        ))}
                    </View>
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
    }

    // ─── Default vertical layout ──────────────────────────────────────────────
    return (
        <>
            <View style={[localStyles.readinessStickyCard, { width: cardWidth }]}>
                <View style={localStyles.readinessHeader}>
                    <Text style={localStyles.readinessTitle}>Readiness</Text>
                </View>
                <ScrollView style={localStyles.readinessScroll} showsVerticalScrollIndicator={false}>
                    <View style={localStyles.muscleGrid}>
                        {chunkArray(allMusclesSorted, 2).map((row, rowIndex) => (
                            <View key={rowIndex} style={localStyles.muscleRow}>
                                {row.map((item) => (
                                    <MuscleReadinessBox
                                        key={item.label}
                                        muscle={item.label}
                                        percent={item.percent}
                                        localStyles={localStyles}
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

const getStyles = (theme) => {
    const cardShadow = isLightTheme(theme) ? getThemedShadow(theme, 'small') : null;

    return StyleSheet.create({
    readinessStickyCard: {
        flex: 1,
        minHeight: 400,
        backgroundColor: theme.surface,
        borderRadius: RADIUS.l,
        ...cardShadow,
        padding: 8,
        overflow: 'hidden'
    },
    readinessHorizontalCard: {
        marginHorizontal: 16,
        marginBottom: 20,
        backgroundColor: theme.surface,
        borderRadius: RADIUS.l,
        ...cardShadow,
        paddingTop: 10,
        paddingBottom: 10,
        overflow: 'hidden',
    },
    readinessHeader: {
        marginBottom: 8,
        paddingHorizontal: 16,
    },
    readinessTitle: {
        fontSize: 12,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    readinessScroll: {
        flex: 1
    },
    muscleGrid: {
        flexDirection: 'column',
        gap: 6,
    },
    muscleRow: {
        flexDirection: 'row',
        gap: 6,
    },
    muscleBox: {
        flex: 1,
        borderRadius: RADIUS.m,
        padding: 10,
    },
    muscleName: {
        fontSize: 13.5,
        fontFamily: FONTS.semiBold,
        marginBottom: 8
    },
    progressBarContainer: {
        height: 4,
        backgroundColor: theme.overlayBorder,
        borderRadius: 2,
        overflow: 'hidden'
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 2
    },
    horizontalScrollContent: {
        paddingHorizontal: 12,
        gap: 6,
        flexDirection: 'row',
        width: '100%',
    },
    horizontalColumn: {
        flex: 1,
        flexDirection: 'column',
        gap: 6,
    },
    muscleBoxHorizontal: {
        borderRadius: RADIUS.m,
        paddingHorizontal: 9,
        paddingVertical: 7,
        gap: 1,
    },
    muscleNameHorizontal: {
        fontSize: 12,
        fontFamily: FONTS.medium,
    },
    musclePercentHorizontal: {
        fontSize: 15,
        fontFamily: FONTS.bold,
        letterSpacing: -0.3,
    },
    progressBarContainerHorizontal: {
        height: 3,
        backgroundColor: theme.overlayBorder,
        borderRadius: 1.5,
        overflow: 'hidden',
        marginTop: 3,
    },
    });
};

export default ReadinessCard;