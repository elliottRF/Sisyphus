import AsyncStorage from '@react-native-async-storage/async-storage';

const EXERCISE_SNAPSHOT_CACHE_VERSION = 1;
const EXERCISE_SNAPSHOT_CACHE_PREFIX = `@exerciseSnapshot:v${EXERCISE_SNAPSHOT_CACHE_VERSION}:`;
const snapshotMemoryCache = new Map();

const getSnapshotCacheKey = (exerciseID) => `${EXERCISE_SNAPSHOT_CACHE_PREFIX}${exerciseID}`;

export const parseStrengthRatios = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

export const computeGraphPoints = (history, isAssisted = false) => {
  if (!history?.length) return [];

  const dailyData = {};

  history.forEach((entry) => {
    const date = new Date(entry.time);
    if (Number.isNaN(date.getTime())) return;
    if (entry.setType === 'W') return;

    const reps = Number(entry.reps) || 0;
    if (reps <= 0) return;

    const dateKey = date.toISOString().split('T')[0];
    const oneRM = Number(entry.oneRM) || 0;
    const weight = Number(entry.weight) || 0;

    if (!dailyData[dateKey]) {
      dailyData[dateKey] = {
        date: entry.time,
        max1RM: 0,
        maxWeight: isAssisted ? Infinity : 0,
      };
    }

    if (!isAssisted && oneRM > dailyData[dateKey].max1RM) {
      dailyData[dateKey].max1RM = Math.round(oneRM);
    }

    if (isAssisted) {
      if (weight < dailyData[dateKey].maxWeight) {
        dailyData[dateKey].maxWeight = Math.round(weight);
      }
      return;
    }

    if (weight > dailyData[dateKey].maxWeight) {
      dailyData[dateKey].maxWeight = Math.round(weight);
    }
  });

  return Object.values(dailyData)
    .filter((day) => day.max1RM > 0 || (isAssisted ? day.maxWeight !== Infinity : day.maxWeight > 0))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

export const computeHistoryGroups = (history) => {
  if (!history?.length) return [];
  const grouped = {};
  history.forEach((entry) => {
    if (!grouped[entry.workoutSession]) grouped[entry.workoutSession] = [];
    grouped[entry.workoutSession].push(entry);
  });
  return Object.entries(grouped).sort((a, b) => Number(b[0]) - Number(a[0]));
};

export const computeExerciseStats = (history, isAssisted = false) => {
  if (!history?.length) {
    return {
      totalSets: 0,
      personalBest: 0,
      totalVolume: 0,
      maxDistance: 0,
      bestPace: null,
    };
  }

  let maxWeight = 0;
  let minWeight = Infinity;
  let totalVolume = 0;
  let totalSets = 0;
  let maxDistance = 0;
  let bestPace = Infinity;

  history.forEach((entry) => {
    totalSets += 1;

    const reps = Number(entry.reps) || 0;
    const weight = Number(entry.weight) || 0;
    const distance = Number(entry.distance) || 0;
    const seconds = Number(entry.seconds) || 0;

    if (reps > 0 && weight > maxWeight) maxWeight = weight;
    if (reps > 0 && weight < minWeight) minWeight = weight;

    totalVolume += weight * reps;

    if (distance > maxDistance) maxDistance = distance;
    if (distance > 0 && seconds > 0) {
      const pace = (seconds / 60) / distance;
      if (pace < bestPace) bestPace = pace;
    }
  });

  return {
    totalSets,
    personalBest: isAssisted ? (minWeight === Infinity ? 0 : minWeight) : maxWeight,
    totalVolume,
    maxDistance,
    bestPace: bestPace === Infinity ? null : bestPace,
  };
};

export const buildExerciseSnapshot = (exercise, history = []) => {
  if (!exercise) return null;

  const isAssisted = exercise.isAssisted === 1 || exercise.isAssisted === true;
  const best1RM = history.reduce((max, entry) => {
    const value = Number(entry.oneRM) || 0;
    return value > max ? value : max;
  }, 0);

  return {
    exerciseID: exercise.exerciseID,
    name: exercise.name,
    targetMuscle: exercise.targetMuscle || '',
    accessoryMuscles: exercise.accessoryMuscles || '',
    isCardio: exercise.isCardio === 1 || exercise.isCardio === true,
    isAssisted,
    strengthRatios: parseStrengthRatios(exercise.strengthRatios),
    stats: computeExerciseStats(history, isAssisted),
    graphData: computeGraphPoints(history, isAssisted),
    groupedHistory: computeHistoryGroups(history),
    best1RM,
    updatedAt: new Date().toISOString(),
  };
};

export const readExerciseSnapshotCache = async (exerciseID) => {
  if (!exerciseID && exerciseID !== 0) return null;

  if (snapshotMemoryCache.has(exerciseID)) {
    return snapshotMemoryCache.get(exerciseID);
  }

  try {
    const raw = await AsyncStorage.getItem(getSnapshotCacheKey(exerciseID));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    snapshotMemoryCache.set(exerciseID, parsed);
    return parsed;
  } catch (error) {
    console.error('Error reading exercise snapshot cache:', error);
    return null;
  }
};

export const getExerciseSnapshotSync = (exerciseID) => {
  if (!exerciseID && exerciseID !== 0) return null;
  return snapshotMemoryCache.get(exerciseID) || null;
};

export const writeExerciseSnapshotCache = async (exerciseID, snapshot) => {
  if (!snapshot) return null;

  try {
    snapshotMemoryCache.set(exerciseID, snapshot);
    await AsyncStorage.setItem(getSnapshotCacheKey(exerciseID), JSON.stringify(snapshot));
    return snapshot;
  } catch (error) {
    console.error('Error writing exercise snapshot cache:', error);
    return snapshot;
  }
};

export const removeExerciseSnapshotCache = async (exerciseID) => {
  snapshotMemoryCache.delete(exerciseID);

  try {
    await AsyncStorage.removeItem(getSnapshotCacheKey(exerciseID));
  } catch (error) {
    console.error('Error removing exercise snapshot cache:', error);
  }
};

export const removeExerciseSnapshotCaches = async (exerciseIDs = []) => {
  const uniqueExerciseIDs = [...new Set(exerciseIDs.filter((id) => id || id === 0))];
  if (!uniqueExerciseIDs.length) return;

  uniqueExerciseIDs.forEach((exerciseID) => snapshotMemoryCache.delete(exerciseID));

  try {
    await AsyncStorage.multiRemove(uniqueExerciseIDs.map(getSnapshotCacheKey));
  } catch (error) {
    console.error('Error removing exercise snapshot caches:', error);
  }
};

export const primeExerciseSnapshotCache = (snapshot) => {
  if (!snapshot?.exerciseID && snapshot?.exerciseID !== 0) return;
  snapshotMemoryCache.set(snapshot.exerciseID, snapshot);
};
