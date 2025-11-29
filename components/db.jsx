import * as SQLite from 'expo-sqlite';
import exerciseData from '../assets/exercises.json';

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
        (workoutSession, exerciseNum, setNum, exerciseID, weight, reps, oneRM, time, name, pr, duration) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
          duration
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
  return await database.getAllAsync(
    `SELECT pe.exerciseID, e.name 
     FROM pinnedExercises pe
     JOIN exercises e ON pe.exerciseID = e.exerciseID;`
  );
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

  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          let importedCount = 0;

          await database.withTransactionAsync(async () => {
            for (const row of rows) {
              // 1. Validate Row
              if (!row['Date'] || !row['Exercise Name']) continue;
              if (row['Set Order'] === 'Note') continue; // Ignore notes

              // 2. Parse Data
              const date = new Date(row['Date']).toISOString();
              const exerciseName = row['Exercise Name'].trim();
              const weight = parseFloat(row['Weight (kg)']) || 0;
              const reps = parseInt(row['Reps'], 10) || 0;
              const durationSeconds = parseInt(row['Duration (sec)'], 10) || 0;
              const durationMinutes = Math.floor(durationSeconds / 60);
              const workoutTitle = row['Workout Name'] || 'Strong Import';

              // Handle "Set Order" (ignore 'D' for drop sets, just treat as normal set)
              // We need to calculate setNum based on previous entries or just increment
              // For simplicity in this import, we might just use the row index or a simple counter per exercise/session
              // But 'Set Order' in CSV usually resets per exercise. 
              // Let's trust the CSV's order or just auto-increment if it's 'D'
              let setNum = parseInt(row['Set Order'], 10);
              if (isNaN(setNum)) setNum = 1; // Default to 1 if 'D' or other non-number

              // 3. Get or Create Exercise
              let exerciseID;
              const existingExercise = await database.getFirstAsync(
                'SELECT exerciseID FROM exercises WHERE name = ?',
                [exerciseName]
              );

              if (existingExercise) {
                exerciseID = existingExercise.exerciseID;
              } else {
                // Create new exercise with default muscle "Other"
                const result = await database.runAsync(
                  'INSERT INTO exercises (name, targetMuscle, accessoryMuscles) VALUES (?, ?, ?)',
                  [exerciseName, 'Other', '']
                );
                exerciseID = result.lastInsertRowId;
              }

              // 4. Insert Workout History
              // We need a workoutSession ID. 
              // Strategy: Use the timestamp as a unique session identifier or group by Date + Workout Name
              // For now, let's just use a hash or simple logic. 
              // Actually, we can just query for an existing session on this date/title or create one.
              // But our workoutHistory table uses `workoutSession` integer. 
              // Let's find the max session and increment for each UNIQUE date/title combo in the CSV?
              // Optimization: Just insert raw data. `workoutSession` is somewhat arbitrary for history display 
              // unless we want to group them perfectly.
              // Let's try to group by Date.

              // Simple approach: Generate a session ID based on time (epoch / 100000 or something) 
              // OR just find if we already inserted this "session" in this transaction.
              // A better way for bulk import:
              // We'll just insert. The `history.jsx` groups by `workoutSession`.
              // We need to ensure `workoutSession` is consistent for all rows of the same workout.
              // The CSV has "Workout #" but that might duplicate across exports.
              // Let's use the Date to determine session.

              const sessionKey = `${date}_${workoutTitle}`;
              // We need a map of sessionKey -> sessionID. But we are inside a loop.
              // Let's just use a large random number or timestamp for sessionID to avoid collision with existing 1, 2, 3...
              // Or better: Fetch max session ID once at start, then increment for each new date encountered.

              // For this implementation, let's just use the timestamp of the workout as the session ID (divided by 1000 to fit integer if needed, or just use it).
              // SQLite INTEGER is 64-bit signed, so Date.now() fits fine.
              const workoutSession = new Date(row['Date']).getTime();

              await database.runAsync(
                `INSERT INTO workoutHistory 
                (workoutSession, exerciseNum, setNum, exerciseID, weight, reps, oneRM, time, name, pr, duration) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                [
                  workoutSession,
                  1, // exerciseNum - hard to calculate perfectly from CSV without pre-processing. 1 is fine for history list.
                  setNum,
                  exerciseID,
                  weight,
                  reps,
                  weight * (1 + reps / 30), // Estimate 1RM
                  date,
                  workoutTitle,
                  0, // pr - we can calculate later or ignore
                  durationMinutes
                ]
              );

              importedCount++;
            }
          });

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
