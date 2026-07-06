import AsyncStorage from '@react-native-async-storage/async-storage';
import { estimateOneRM } from './oneRM';

const SNAPSHOT_KEY_PREFIX = 'exercise_snapshot_';
const MEMORY_CACHE = new Map();

/**
 * Loads all stored snapshots into memory for synchronous access.
 * Should be called once during app initialization.
 */
export async function primeExerciseSnapshots() {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const snapshotKeys = keys.filter(k => k.startsWith(SNAPSHOT_KEY_PREFIX));
        const pairs = await AsyncStorage.multiGet(snapshotKeys);
        
        pairs.forEach(([key, value]) => {
            if (value) {
                const exerciseID = parseInt(key.replace(SNAPSHOT_KEY_PREFIX, ''));
                MEMORY_CACHE.set(exerciseID, JSON.parse(value));
            }
        });
    } catch (e) {
        console.error('[Snapshots] Error priming snapshots:', e);
    }
}

/**
 * Synchronously retrieves a snapshot from memory.
 */
export function getExerciseSnapshotSync(exerciseID) {
    return MEMORY_CACHE.get(parseInt(exerciseID));
}

/**
 * Updates a snapshot in memory and persistent storage.
 */
export async function updateExerciseSnapshot(exerciseID, data) {
    const id = parseInt(exerciseID);
    const existing = MEMORY_CACHE.get(id) || {};
    const updated = { ...existing, ...data, lastUpdated: Date.now() };
    
    MEMORY_CACHE.set(id, updated);
    try {
        await AsyncStorage.setItem(`${SNAPSHOT_KEY_PREFIX}${id}`, JSON.stringify(updated));
    } catch (e) {
        console.error(`[Snapshots] Error saving snapshot for ${id}:`, e);
    }
}

/**
 * Invalidates a snapshot.
 */
export async function invalidateExerciseSnapshot(exerciseID) {
    const id = parseInt(exerciseID);
    MEMORY_CACHE.delete(id);
    try {
        await AsyncStorage.removeItem(`${SNAPSHOT_KEY_PREFIX}${id}`);
    } catch (e) {
        console.error(`[Snapshots] Error removing snapshot for ${id}:`, e);
    }
}

/**
 * Helper to calculate stats and muscle targets from a history array.
 * This can be used to generate a snapshot from raw DB data.
 */
export function calculateSnapshotFromHistory(exerciseID, history, exerciseDetails) {
    if (!history || history.length === 0) return null;

    let maxWeight = 0;
    let minWeight = Infinity;
    let volume = 0;
    let totalSetsCount = 0;
    let maxDist = 0;
    let bestP = Infinity;

    // Header data: workout count, est. 1RM trend, last PR — cached so the
    // exercise page header renders complete on first paint.
    const distinctSessions = new Set();
    const sixMonthCutoff = Date.now() - 182 * 86400000;
    let est1RM = 0;
    let est1RMBefore = 0;
    let lastPRTime = null;

    history.forEach(entry => {
        totalSetsCount++;
        if (entry.reps > 0 && entry.weight > maxWeight) maxWeight = entry.weight;
        if (entry.reps > 0 && entry.weight < minWeight) minWeight = entry.weight;
        volume += (entry.weight * entry.reps);

        if (entry.distance > maxDist) maxDist = entry.distance;
        if (entry.distance > 0 && entry.seconds > 0) {
            const pace = (entry.seconds / 60) / entry.distance;
            if (pace < bestP) bestP = pace;
        }

        distinctSessions.add(entry.workoutSession);
        const reps = parseInt(entry.reps, 10) || 0;
        const weight = parseFloat(entry.weight) || 0;
        const t = new Date(entry.time).getTime();
        if (reps > 0 && weight > 0) {
            const oneRM = estimateOneRM(weight, reps);
            est1RM = Math.max(est1RM, oneRM);
            if (t < sixMonthCutoff) est1RMBefore = Math.max(est1RMBefore, oneRM);
        }
        if ((entry.is1rmPR || entry.isWeightPR || entry.isVolumePR) && (!lastPRTime || t > lastPRTime)) {
            lastPRTime = t;
        }
    });

    const isAssisted = !!exerciseDetails?.isAssisted;

    // Best weight held for at least N reps (1–10), for the Rep Records card.
    const repRecords = [];
    for (let r = 1; r <= 10; r++) {
        let best = 0;
        history.forEach(entry => {
            const reps = parseInt(entry.reps, 10) || 0;
            const weight = parseFloat(entry.weight) || 0;
            if (reps >= r && weight > best) best = weight;
        });
        if (best > 0) repRecords.push({ reps: r, weight: best });
    }

    return {
        name: exerciseDetails?.name,
        stats: {
            totalSets: totalSetsCount,
            personalBest: isAssisted ? (minWeight === Infinity ? 0 : minWeight) : maxWeight,
            totalVolume: volume,
            maxDistance: maxDist,
            bestPace: bestP,
        },
        header: {
            workoutCount: distinctSessions.size,
            primaryMuscle: exerciseDetails?.targetMuscle?.split(',')[0]?.trim() || null,
            trend: {
                est1RM,
                pct: est1RMBefore > 0 ? ((est1RM - est1RMBefore) / est1RMBefore) * 100 : null,
                lastPRTime,
            },
            repRecords,
        },
        muscles: {
            // Store normalized slugs (trimmed + lowercased) so the body
            // diagram can highlight them straight from the cached snapshot —
            // raw values like "Chest" don't match the highlighter's slugs.
            target: normMuscleSlugs(exerciseDetails?.targetMuscle),
            accessory: normMuscleSlugs(exerciseDetails?.accessoryMuscles),
        }
    };
}

const normMuscleSlugs = (str) =>
    (str ? str.split(',').map((m) => m.trim().toLowerCase()).filter(Boolean) : []);
