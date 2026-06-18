import { muscleMapping } from '../constants/muscles';

export const SETS_CAP = 6;
export const RECOVERY_WINDOW_DAYS = 4;

/**
 * Decayed training load per muscle slug from recent usage rows
 * (fetchRecentMuscleUsage). This is the single source of truth for the
 * fatigue model — Home's body map / readiness grid and the template
 * readiness badges all derive from it.
 */
export const computeMuscleScores = (usageData, accessoryWeight = 0.5, now = new Date()) => {
    const muscleStats = {};

    (usageData || []).forEach(exercise => {
        if (!exercise.date) return;

        const exerciseDate = new Date(exercise.date);
        const hoursAgo = (now - exerciseDate) / (1000 * 60 * 60);
        const daysAgoDecimal = hoursAgo / 24;
        if (daysAgoDecimal >= RECOVERY_WINDOW_DAYS || daysAgoDecimal < 0) return;

        const decayFactor = 1 - (daysAgoDecimal / RECOVERY_WINDOW_DAYS);
        const sets = parseInt(exercise.sets, 10) || 0;
        if (sets === 0) return;

        const addLoad = (muscleName, weight) => {
            const slug = muscleMapping[muscleName] || muscleName.toLowerCase();
            muscleStats[slug] = Math.min(
                SETS_CAP,
                (muscleStats[slug] || 0) + sets * decayFactor * weight
            );
        };

        (exercise.targetMuscle || '').split(',').map(m => m.trim()).filter(Boolean)
            .forEach(muscle => addLoad(muscle, 1));
        (exercise.accessoryMuscles || '').split(',').map(m => m.trim()).filter(Boolean)
            .forEach(muscle => addLoad(muscle, accessoryWeight));
    });

    return muscleStats;
};

/** 100 = fully recovered, 0 = maximally fatigued. */
export const slugRecoveryPercent = (muscleStats, slug) => {
    const score = muscleStats?.[slug] ?? 0;
    return Math.max(0, Math.min(100, Math.round(100 - (score / SETS_CAP) * 100)));
};

/**
 * Average recovery percent across a set of muscle slugs (the same figure the
 * template readiness badge shows). Returns null if there are no slugs.
 */
export const averageSlugRecovery = (muscleStats, slugs) => {
    if (!slugs || slugs.length === 0) return null;
    const percents = slugs.map(slug => slugRecoveryPercent(muscleStats, slug));
    return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
};

/**
 * How long until a set of muscle slugs averages at least `targetPercent`
 * recovered. Because training load only ever decays (to zero at the end of the
 * RECOVERY_WINDOW), readiness rises monotonically with time, so we step forward
 * from now and return the first offset that clears the target.
 *
 * Returns milliseconds until the target (0 if already met), or null if there's
 * nothing to project from.
 */
export const timeUntilSlugRecovery = (usageData, accessoryWeight, slugs, targetPercent = 80) => {
    if (!slugs || slugs.length === 0) return null;

    const now = new Date();
    const readinessAt = (date) =>
        averageSlugRecovery(computeMuscleScores(usageData, accessoryWeight, date), slugs);

    if (readinessAt(now) >= targetPercent) return 0;

    // Once every usage row has decayed out (RECOVERY_WINDOW from now) every
    // muscle reads 100%, so the target is always reached within the window.
    const STEP_MS = 15 * 60 * 1000; // 15-minute resolution
    const maxOffsetMs = RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    for (let offset = STEP_MS; offset <= maxOffsetMs; offset += STEP_MS) {
        if (readinessAt(new Date(now.getTime() + offset)) >= targetPercent) {
            return offset;
        }
    }
    return maxOffsetMs;
};
