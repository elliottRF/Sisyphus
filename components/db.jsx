import * as SQLite from 'expo-sqlite';
import exerciseData from '../assets/exercises.json';
import Papa from 'papaparse';
let db;

const getDb = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync('sisyphus.db');
  }
  return db;
};

// Create and populate the exercises table
export const setupDatabase = async () => {
  try {
    const database = await getDb();
    await database.execAsync('PRAGMA foreign_keys = ON;');

    // Create the tables if they don't exist
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS exercises (
        exerciseID INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        targetMuscle TEXT NOT NULL,
        accessoryMuscles TEXT
      );
      
      CREATE TABLE IF NOT EXISTS workoutHistory (
        workoutSession INTEGER,
        exerciseNum INTEGER,
        setNum INTEGER,
        exerciseID INTEGER,
        weight FLOAT,
        reps INTEGER,
        oneRM FLOAT,
        time time,
        name TEXT,
        pr INTEGER,
        duration INTEGER,
        FOREIGN KEY (exerciseID) REFERENCES exercises(exerciseID)
      );
    `);

    // Check if exercises table is empty before populating
    const result = await database.getFirstAsync('SELECT COUNT(*) as count FROM exercises;');
    const count = result?.count || 0;

    // Only populate if the table is empty
    if (count === 0) {
      for (const { exerciseID, name, targetMuscle, accessoryMuscles } of exerciseData) {
        await database.runAsync(
          `INSERT OR REPLACE INTO exercises (exerciseID, name, targetMuscle, accessoryMuscles) 
           VALUES (?, ?, ?, ?);`,
          [exerciseID, name, targetMuscle, accessoryMuscles]
        );
      }
    }

    // Migration: Add duration column if it doesn't exist
    try {
      await database.execAsync('ALTER TABLE workoutHistory ADD COLUMN duration INTEGER;');
    } catch (e) {
      // Column likely already exists, ignore error
    }

    // Migration: Add setType and notes columns
    try {
      await database.execAsync('ALTER TABLE workoutHistory ADD COLUMN setType TEXT;');
    } catch (e) {
      if (!e.message.includes('duplicate column name')) {
        console.log('Migration error (setType):', e);
      }
    }
    try {
      await database.execAsync('ALTER TABLE workoutHistory ADD COLUMN notes TEXT;');
    } catch (e) {
      if (!e.message.includes('duplicate column name')) {
        console.log('Migration error (notes):', e);
      }
    }

    // Migration: Add new PR columns
    try {
      await database.execAsync('ALTER TABLE workoutHistory ADD COLUMN is1rmPR INTEGER DEFAULT 0;');
    } catch (e) { }
    try {
      await database.execAsync('ALTER TABLE workoutHistory ADD COLUMN isVolumePR INTEGER DEFAULT 0;');
    } catch (e) { }
    try {
      await database.execAsync('ALTER TABLE workoutHistory ADD COLUMN isWeightPR INTEGER DEFAULT 0;');
    } catch (e) { }

    // Create pinnedExercises table
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS pinnedExercises (
        exerciseID INTEGER PRIMARY KEY,
        FOREIGN KEY (exerciseID) REFERENCES exercises(exerciseID)
      );
    `);

    console.log('Database setup completed successfully');
  } catch (error) {
    console.error('Database setup error:', error);
    throw error;
  }
};

// Fetch all exercises from the database
export const fetchExercises = async () => {
  const database = await getDb();
  return await database.getAllAsync('SELECT * FROM exercises;');
};

// Insert exercise entries
export const insertExercise = async (exerciseName, targetMuscles, accessoryMuscles) => {
  const database = await getDb();
  try {
    await database.runAsync(
      `INSERT INTO exercises (name, targetMuscle, accessoryMuscles) 
       VALUES (?, ?, ?);`,
      [exerciseName, targetMuscles, accessoryMuscles]
    );
    return "Exercise inserted successfully!";
  } catch (error) {
    if (error.message && error.message.includes("UNIQUE constraint failed")) {
      throw new Error("Exercise name must be unique.");
    }
    throw error;
  }
};

// Fetch all workouts from the database
export const fetchWorkoutHistory = async () => {
  const database = await getDb();
  return await database.getAllAsync('SELECT * FROM workoutHistory;');
};

// Get the latest workout session number
export const getLatestWorkoutSession = async () => {
  const database = await getDb();
  const result = await database.getFirstAsync('SELECT MAX(workoutSession) as latestSession FROM workoutHistory;');
  return result?.latestSession !== null ? result.latestSession : 0;
};

// Insert workout history entries
export const insertWorkoutHistory = async (workoutEntries, workoutTitle, duration) => {
  const database = await getDb();
  // Use a transaction for bulk insert if possible, or just sequential awaits
  // expo-sqlite new API has withTransactionAsync
  await database.withTransactionAsync(async () => {
    for (const entry of workoutEntries) {
      await database.runAsync(
        `INSERT INTO workoutHistory 
        (workoutSession, exerciseNum, setNum, exerciseID, weight, reps, oneRM, time, name, pr, duration, setType, notes, is1rmPR, isVolumePR, isWeightPR) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          entry.workoutSession,
          entry.exerciseNum,
          entry.setNum,
          entry.exerciseID,
          entry.weight,
          entry.reps,
          entry.oneRM,
          entry.time,
          workoutTitle,
          entry.pr, // Keeping this for backward compatibility or as a general "is any PR" flag? Plan says to use specific flags. Let's keep it as is1rmPR for now or just map it.
          duration,
          entry.setType || 'N', // Default to Normal
          entry.notes || '',
          entry.is1rmPR || 0,
          entry.isVolumePR || 0,
          entry.isWeightPR || 0
        ]
      );
    }
  });
};

// Fetch workout history for a specific session
export const fetchWorkoutHistoryBySession = async (sessionNumber) => {
  const database = await getDb();
  return await database.getAllAsync(
    `SELECT wh.*, e.name as exerciseName 
     FROM workoutHistory wh
     JOIN exercises e ON wh.exerciseID = e.exerciseID
     WHERE workoutSession = ?
     ORDER BY exerciseNum, setNum;`,
    [sessionNumber]
  );
};

// Calculate total volume for a specific workout session
export const calculateSessionVolume = async (sessionNumber) => {
  const database = await getDb();
  return await database.getFirstAsync(
    `SELECT 
      SUM(weight * reps) as totalVolume,
      COUNT(DISTINCT exerciseID) as uniqueExercises
     FROM workoutHistory
     WHERE workoutSession = ?;`,
    [sessionNumber]
  );
};

// Delete a specific workout session
export const deleteWorkoutSession = async (sessionNumber) => {
  const database = await getDb();
  await database.runAsync(
    `DELETE FROM workoutHistory WHERE workoutSession = ?;`,
    [sessionNumber]
  );
};

// Fetch exercise history for a specific exerciseID
export const fetchExerciseHistory = async (exerciseID) => {
  const database = await getDb();
  return await database.getAllAsync(
    `SELECT * FROM workoutHistory
      WHERE exerciseID= ?;`,
    [exerciseID]
  );
};

// Get current PRs for an exercise
export const getExercisePRs = async (exerciseID) => {
  const database = await getDb();

  // Get max values
  const result = await database.getFirstAsync(
    `SELECT 
      MAX(oneRM) as maxOneRM,
      MAX(weight * reps) as maxVolume,
      MAX(weight) as maxWeight
     FROM workoutHistory
     WHERE exerciseID = ? AND reps > 0;`,
    [exerciseID]
  );

  // Get the max reps at the max weight
  const maxWeight = result?.maxWeight || 0;
  const repsAtMaxWeight = maxWeight > 0 ? await database.getFirstAsync(
    `SELECT MAX(reps) as maxReps
     FROM workoutHistory
     WHERE exerciseID = ? AND weight = ?;`,
    [exerciseID, maxWeight]
  ) : null;

  return {
    maxOneRM: result?.maxOneRM || 0,
    maxVolume: result?.maxVolume || 0,
    maxWeight: maxWeight,
    maxRepsAtMaxWeight: repsAtMaxWeight?.maxReps || 0
  };
};

// Check if PR (Deprecated in favor of manual check with getExercisePRs, but keeping for compatibility if needed)
export const calculateIfPR = async (exerciseID, oneRM) => {
  const { maxOneRM } = await getExercisePRs(exerciseID);
  return oneRM > maxOneRM ? 1 : 0;
};

// Pin an exercise
export const pinExercise = async (exerciseID) => {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR IGNORE INTO pinnedExercises (exerciseID) VALUES (?);`,
    [exerciseID]
  );
};

// Unpin an exercise
export const unpinExercise = async (exerciseID) => {
  const database = await getDb();
  await database.runAsync(
    `DELETE FROM pinnedExercises WHERE exerciseID = ?;`,
    [exerciseID]
  );
};

// Get all pinned exercises
export const getPinnedExercises = async () => {
  const database = await getDb();
  try {
    // First ensure the table exists
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS pinnedExercises (
        exerciseID INTEGER PRIMARY KEY,
        FOREIGN KEY (exerciseID) REFERENCES exercises(exerciseID)
      );
    `);

    return await database.getAllAsync(
      `SELECT pe.exerciseID, e.name 
       FROM pinnedExercises pe
       JOIN exercises e ON pe.exerciseID = e.exerciseID;`
    );
  } catch (error) {
    console.error('Error in getPinnedExercises:', error);
    return [];
  }
};

// Fetch 1RM progress for a specific exercise
export const fetchExerciseProgress = async (exerciseID) => {
  const database = await getDb();
  return await database.getAllAsync(
    `SELECT time, oneRM 
     FROM workoutHistory 
     WHERE exerciseID = ? 
     ORDER BY time ASC;`,
    [exerciseID]
  );
};

// Fetch muscle usage from the last N days
export const fetchRecentMuscleUsage = async (days) => {
  const database = await getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return await database.getAllAsync(
    `SELECT 
      e.targetMuscle,
      e.accessoryMuscles,
      COUNT(*) as sets
     FROM workoutHistory wh
     JOIN exercises e ON wh.exerciseID = e.exerciseID
     WHERE wh.time >= ? AND (wh.setType IS NULL OR wh.setType != 'W')
     GROUP BY wh.exerciseID, e.targetMuscle, e.accessoryMuscles;`,
    [cutoffDate.toISOString()]
  );
};
// Import Strong CSV data with PR calculation and progress tracking
export const importStrongData = async (csvContent, progressCallback = null) => {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          const totalRows = rows.length;

          // Report parsing complete
          if (progressCallback) {
            progressCallback({ stage: 'parsing', current: totalRows, total: totalRows });
          }

          // Pre-process: Group rows by date (timestamp key for grouping, will be replaced with sequential numbers)
          const workoutMap = new Map(); // Map<timestamp, Map<exerciseName, Array<setData>>>
          const notesMap = new Map(); // Map<timestamp, Map<exerciseName, noteString>>

          // First pass: validate and group data by date
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            // Validate Row
            if (!row['Date'] || !row['Exercise Name']) continue;

            const date = new Date(row['Date']).toISOString();
            const exerciseName = row['Exercise Name'].trim();
            // Use timestamp as temporary key for grouping workouts by date
            const dateKey = new Date(row['Date']).getTime();

            // Handle Notes Row
            if (row['Set Order'] === 'Note') {
              if (!notesMap.has(dateKey)) {
                notesMap.set(dateKey, new Map());
              }
              const sessionNotes = notesMap.get(dateKey);
              // If there's already a note, append it? Or overwrite? Strong usually has one note per exercise per session.
              sessionNotes.set(exerciseName, row['Notes'] || '');
              continue;
            }

            // Parse Data
            const weight = parseFloat(row['Weight (kg)']) || 0;
            const reps = parseInt(row['Reps'], 10) || 0;
            const durationSeconds = parseInt(row['Duration (sec)'], 10) || 0;
            const durationMinutes = Math.floor(durationSeconds / 60);
            const workoutTitle = row['Workout Name'] || 'Strong Import';

            let setNum = parseInt(row['Set Order'], 10);
            let setType = 'N'; // Normal

            // Handle Set Type (W, D)
            if (row['Set Order'] === 'W' || (row['Set Order'] && row['Set Order'].toString().toUpperCase().includes('W'))) {
              setType = 'W';
              setNum = 0; // Or keep it 0 for sorting? We'll assign sequential numbers later if needed, but for now let's trust the order in CSV or just assign 0.
            } else if (row['Set Order'] === 'D' || (row['Set Order'] && row['Set Order'].toString().toUpperCase().includes('D'))) {
              setType = 'D';
              setNum = 0;
            }

            if (isNaN(setNum)) setNum = 1;

            // Calculate 1RM
            const oneRM = weight * (1 + reps / 30);

            // Store set data
            const setData = {
              exerciseName,
              weight,
              reps,
              oneRM,
              setNum,
              date,
              workoutTitle,
              durationMinutes,
              setType
            };

            // Group by date key (temporary timestamp grouping)
            if (!workoutMap.has(dateKey)) {
              workoutMap.set(dateKey, new Map());
            }

            const exerciseMap = workoutMap.get(dateKey);
            if (!exerciseMap.has(exerciseName)) {
              exerciseMap.set(exerciseName, []);
            }

            exerciseMap.get(exerciseName).push(setData);
          }

          // Sort workout sessions chronologically (oldest first)
          const sortedDateKeys = Array.from(workoutMap.keys()).sort((a, b) => a - b);

          if (progressCallback) {
            progressCallback({ stage: 'preparing', current: 0, total: sortedDateKeys.length });
          }

          // Get the current max session number to continue from
          const currentMaxSession = await database.getFirstAsync(
            'SELECT MAX(workoutSession) as maxSession FROM workoutHistory'
          );
          let nextSessionNumber = (currentMaxSession?.maxSession || 0) + 1;

          // Track best 1RM per exercise across all imports
          const exerciseBestOneRM = new Map(); // Map<exerciseID, bestOneRM>
          const exerciseBestVolume = new Map(); // Map<exerciseID, bestVolume>
          const exerciseBestWeight = new Map(); // Map<exerciseID, bestWeight>
          const exerciseBestRepsAtMaxWeight = new Map(); // Map<exerciseID, bestRepsAtMaxWeight>
          let importedCount = 0;

          await database.withTransactionAsync(async () => {
            // Process workouts chronologically, assigning sequential session numbers
            for (let sessionIdx = 0; sessionIdx < sortedDateKeys.length; sessionIdx++) {
              const dateKey = sortedDateKeys[sessionIdx];
              const workoutSession = nextSessionNumber; // Use sequential session number
              nextSessionNumber++; // Increment for next session

              const exerciseMap = workoutMap.get(dateKey);
              const sessionNotes = notesMap.get(dateKey);

              // For each exercise in this workout
              for (const [exerciseName, sets] of exerciseMap.entries()) {
                // Get or create exercise
                let exerciseID;
                const existingExercise = await database.getFirstAsync(
                  'SELECT exerciseID FROM exercises WHERE name = ?',
                  [exerciseName]
                );

                if (existingExercise) {
                  exerciseID = existingExercise.exerciseID;
                } else {
                  const result = await database.runAsync(
                    'INSERT INTO exercises (name, targetMuscle, accessoryMuscles) VALUES (?, ?, ?)',
                    [exerciseName, 'Other', '']
                  );
                  exerciseID = result.lastInsertRowId;
                }

                // Get Note for this exercise
                const note = sessionNotes ? sessionNotes.get(exerciseName) : '';

                // Check if this is a PR (beats historical best for this exercise)
                const historicalBestOneRM = exerciseBestOneRM.get(exerciseID) || 0;
                const historicalBestVolume = exerciseBestVolume.get(exerciseID) || 0;
                const historicalBestWeight = exerciseBestWeight.get(exerciseID) || 0;
                const historicalBestRepsAtMaxWeight = exerciseBestRepsAtMaxWeight.get(exerciseID) || 0;

                // Find maxes in this workout
                let maxOneRMInWorkout = 0;
                let maxVolumeInWorkout = 0;
                let maxWeightInWorkout = 0;
                let maxRepsAtMaxWeight = 0;
                let bestSetIndexOneRM = -1;
                let bestSetIndexVolume = -1;
                let bestSetIndexWeight = -1;

                sets.forEach((set, idx) => {
                  // 1RM
                  if (set.oneRM > maxOneRMInWorkout) {
                    maxOneRMInWorkout = set.oneRM;
                    bestSetIndexOneRM = idx;
                  }
                  // Volume (Weight * Reps)
                  const volume = set.weight * set.reps;
                  if (volume > maxVolumeInWorkout) {
                    maxVolumeInWorkout = volume;
                    bestSetIndexVolume = idx;
                  }
                  // Weight: find max weight, then max reps at that weight
                  if (set.reps > 0) {
                    if (set.weight > maxWeightInWorkout) {
                      maxWeightInWorkout = set.weight;
                      maxRepsAtMaxWeight = set.reps;
                      bestSetIndexWeight = idx;
                    } else if (set.weight === maxWeightInWorkout && set.reps > maxRepsAtMaxWeight) {
                      maxRepsAtMaxWeight = set.reps;
                      bestSetIndexWeight = idx;
                    }
                  }
                });

                const is1rmPR = maxOneRMInWorkout > historicalBestOneRM;
                const isVolumePR = maxVolumeInWorkout > historicalBestVolume;
                // Weight PR: either new max weight OR matching weight with more reps
                const isWeightPR =
                  maxWeightInWorkout > historicalBestWeight ||
                  (maxWeightInWorkout === historicalBestWeight && maxRepsAtMaxWeight > historicalBestRepsAtMaxWeight);

                // Update historical bests if PRs
                if (is1rmPR) exerciseBestOneRM.set(exerciseID, maxOneRMInWorkout);
                if (isVolumePR) exerciseBestVolume.set(exerciseID, maxVolumeInWorkout);
                if (isWeightPR) {
                  exerciseBestWeight.set(exerciseID, maxWeightInWorkout);
                  exerciseBestRepsAtMaxWeight.set(exerciseID, maxRepsAtMaxWeight);
                }

                // Insert all sets
                for (let i = 0; i < sets.length; i++) {
                  const set = sets[i];
                  const isThisSet1rmPR = (is1rmPR && i === bestSetIndexOneRM) ? 1 : 0;
                  const isThisSetVolumePR = (isVolumePR && i === bestSetIndexVolume) ? 1 : 0;
                  const isThisSetWeightPR = (isWeightPR && i === bestSetIndexWeight) ? 1 : 0;

                  // Legacy PR flag (if it's any kind of PR, or just 1RM? Let's stick to 1RM for legacy or maybe OR them)
                  // For now, let's say legacy PR = 1RM PR to avoid confusion, or maybe if any PR is hit?
                  // The prompt says "it already does the 1RM", so let's keep `pr` as 1RM PR for backward compat.
                  const isLegacyPR = isThisSet1rmPR;

                  await database.runAsync(
                    `INSERT INTO workoutHistory 
                    (workoutSession, exerciseNum, setNum, exerciseID, weight, reps, oneRM, time, name, pr, duration, setType, notes, is1rmPR, isVolumePR, isWeightPR) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                    [
                      workoutSession,
                      1,
                      set.setNum,
                      exerciseID,
                      set.weight,
                      set.reps,
                      set.oneRM,
                      set.date,
                      set.workoutTitle,
                      isLegacyPR,
                      set.durationMinutes,
                      set.setType,
                      note,
                      isThisSet1rmPR,
                      isThisSetVolumePR,
                      isThisSetWeightPR
                    ]
                  );

                  importedCount++;
                }
              }

              // Report progress every 10 workouts or at the end
              if (progressCallback && (sessionIdx % 10 === 0 || sessionIdx === sortedDateKeys.length - 1)) {
                progressCallback({
                  stage: 'importing',
                  current: sessionIdx + 1,
                  total: sortedDateKeys.length,
                  setsImported: importedCount
                });
              }
            }
          });

          if (progressCallback) {
            progressCallback({ stage: 'complete', current: importedCount, total: importedCount });
          }

          resolve(importedCount);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};
