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
    } catch (e) { }
    try {
      await database.execAsync('ALTER TABLE workoutHistory ADD COLUMN notes TEXT;');
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
        (workoutSession, exerciseNum, setNum, exerciseID, weight, reps, oneRM, time, name, pr, duration, setType, notes) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
          entry.pr,
          duration,
          entry.setType || 'N', // Default to Normal
          entry.notes || ''
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

// Check if PR
export const calculateIfPR = async (exerciseID, oneRM) => {
  const database = await getDb();
  const result = await database.getFirstAsync(
    `SELECT 
      MAX(oneRM) as maxOneRM
     FROM workoutHistory
     WHERE exerciseID = ?;`,
    [exerciseID]
  );

  const maxOneRM = result?.maxOneRM || 0;
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

          // Pre-process: Group rows by workoutSession and build set data
          const workoutMap = new Map(); // Map<workoutSession, Map<exerciseName, Array<setData>>>
          const notesMap = new Map(); // Map<workoutSession, Map<exerciseName, noteString>>

          // First pass: validate and group data
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            // Validate Row
            if (!row['Date'] || !row['Exercise Name']) continue;

            const date = new Date(row['Date']).toISOString();
            const exerciseName = row['Exercise Name'].trim();
            const workoutSession = new Date(row['Date']).getTime();

            // Handle Notes Row
            if (row['Set Order'] === 'Note') {
              if (!notesMap.has(workoutSession)) {
                notesMap.set(workoutSession, new Map());
              }
              const sessionNotes = notesMap.get(workoutSession);
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

            // Group by workout session
            if (!workoutMap.has(workoutSession)) {
              workoutMap.set(workoutSession, new Map());
            }

            const exerciseMap = workoutMap.get(workoutSession);
            if (!exerciseMap.has(exerciseName)) {
              exerciseMap.set(exerciseName, []);
            }

            exerciseMap.get(exerciseName).push(setData);
          }

          // Sort workout sessions chronologically (oldest first)
          const sortedSessions = Array.from(workoutMap.keys()).sort((a, b) => a - b);

          if (progressCallback) {
            progressCallback({ stage: 'preparing', current: 0, total: sortedSessions.length });
          }

          // Track best 1RM per exercise across all imports
          const exerciseBestOneRM = new Map(); // Map<exerciseID, bestOneRM>
          let importedCount = 0;

          await database.withTransactionAsync(async () => {
            // Process workouts chronologically
            for (let sessionIdx = 0; sessionIdx < sortedSessions.length; sessionIdx++) {
              const workoutSession = sortedSessions[sessionIdx];
              const exerciseMap = workoutMap.get(workoutSession);
              const sessionNotes = notesMap.get(workoutSession);

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

                // Find the set with max 1RM in this workout for this exercise
                let maxOneRMInWorkout = 0;
                let bestSetIndex = 0;
                sets.forEach((set, idx) => {
                  if (set.oneRM > maxOneRMInWorkout) {
                    maxOneRMInWorkout = set.oneRM;
                    bestSetIndex = idx;
                  }
                });

                // Check if this is a PR (beats historical best for this exercise)
                const historicalBest = exerciseBestOneRM.get(exerciseID) || 0;
                const isPR = maxOneRMInWorkout > historicalBest;

                // Update historical best if this is a PR
                if (isPR) {
                  exerciseBestOneRM.set(exerciseID, maxOneRMInWorkout);
                }

                // Insert all sets, marking only the best one as PR if applicable
                for (let i = 0; i < sets.length; i++) {
                  const set = sets[i];
                  const isThisSetPR = (isPR && i === bestSetIndex) ? 1 : 0;

                  await database.runAsync(
                    `INSERT INTO workoutHistory 
                    (workoutSession, exerciseNum, setNum, exerciseID, weight, reps, oneRM, time, name, pr, duration, setType, notes) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
                      isThisSetPR,
                      set.durationMinutes,
                      set.setType,
                      note // Save note to every set for now
                    ]
                  );

                  importedCount++;
                }
              }

              // Report progress every 10 workouts or at the end
              if (progressCallback && (sessionIdx % 10 === 0 || sessionIdx === sortedSessions.length - 1)) {
                progressCallback({
                  stage: 'importing',
                  current: sessionIdx + 1,
                  total: sortedSessions.length,
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
