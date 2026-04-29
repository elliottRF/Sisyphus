import AsyncStorage from '@react-native-async-storage/async-storage';

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
        console.log(`[Snapshots] Primed ${MEMORY_CACHE.size} exercises.`);
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
    });

    const isAssisted = !!exerciseDetails?.isAssisted;

    return {
        name: exerciseDetails?.name,
        stats: {
            totalSets: totalSetsCount,
            personalBest: isAssisted ? (minWeight === Infinity ? 0 : minWeight) : maxWeight,
            totalVolume: volume,
            maxDistance: maxDist,
            bestPace: bestP,
        },
        muscles: {
            target: exerciseDetails?.targetMuscle ? exerciseDetails.targetMuscle.split(',') : [],
            accessory: exerciseDetails?.accessoryMuscles ? exerciseDetails.accessoryMuscles.split(',') : []
        }
    };
}
