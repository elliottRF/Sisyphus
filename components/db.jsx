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
        accessoryMuscles TEXT,
        isCardio INTEGER DEFAULT 0
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
        setType TEXT,
        notes TEXT,
        is1rmPR INTEGER DEFAULT 0,
        isVolumePR INTEGER DEFAULT 0,
        isWeightPR INTEGER DEFAULT 0,
        distance FLOAT,
        seconds INTEGER,
        FOREIGN KEY (exerciseID) REFERENCES exercises(exerciseID)
      );
    `);

    // Helper to ensure column exists
    const ensureColumnExists = async (tableName, columnName, formattedDefinition) => {
      try {
        const tableInfo = await database.getAllAsync(`PRAGMA table_info(${tableName});`);
        const columnExists = tableInfo.some(col => col.name === columnName);
        if (!columnExists) {
          console.log(`Adding missing column ${columnName} to ${tableName}...`);
          await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${formattedDefinition};`);
        }
      } catch (e) {
        console.log(`Error checking/adding column ${columnName} to ${tableName}:`, e);
      }
    };

    // Check if exercises table is empty before populating
    const result = await database.getFirstAsync('SELECT COUNT(*) as count FROM exercises;');
    const count = result?.count || 0;

    // Only populate if the table is empty
    if (count === 0) {
      for (const { exerciseID, name, targetMuscle, accessoryMuscles, cardio } of exerciseData) {
        await database.runAsync(
          `INSERT OR REPLACE INTO exercises (exerciseID, name, targetMuscle, accessoryMuscles, isCardio) 
           VALUES (?, ?, ?, ?, ?);`,
          [exerciseID, name, targetMuscle, accessoryMuscles, cardio ? 1 : 0]
        );
      }
    }

    // Migrations using helper
    await ensureColumnExists('workoutHistory', 'duration', 'INTEGER');
    await ensureColumnExists('workoutHistory', 'setType', 'TEXT');
    await ensureColumnExists('workoutHistory', 'notes', 'TEXT');
    await ensureColumnExists('workoutHistory', 'is1rmPR', 'INTEGER DEFAULT 0');
    await ensureColumnExists('workoutHistory', 'isVolumePR', 'INTEGER DEFAULT 0');
    await ensureColumnExists('workoutHistory', 'isWeightPR', 'INTEGER DEFAULT 0');
    await ensureColumnExists('exercises', 'isCardio', 'INTEGER DEFAULT 0');
    await ensureColumnExists('workoutHistory', 'distance', 'FLOAT');
    await ensureColumnExists('workoutHistory', 'seconds', 'INTEGER');

    // Body Weight Migrations
    await ensureColumnExists('bodyWeight', 'datetime', 'TEXT');
    await ensureColumnExists('bodyWeight', 'weight', 'REAL');

    // Create pinnedExercises table
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS pinnedExercises (
        exerciseID INTEGER PRIMARY KEY,
        FOREIGN KEY (exerciseID) REFERENCES exercises(exerciseID)
      );
    `);

    // Create workoutTemplates table
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS workoutTemplates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt TEXT
      );
    `);

    // Create bodyWeight table
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS bodyWeight (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        datetime TEXT NOT NULL UNIQUE,
        weight REAL NOT NULL
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
export const insertExercise = async (exerciseName, targetMuscles, accessoryMuscles, isCardio = 0) => {
  const database = await getDb();
  try {
    const result = await database.runAsync(
      `INSERT INTO exercises (name, targetMuscle, accessoryMuscles, isCardio) 
       VALUES (?, ?, ?, ?);`,
      [exerciseName, targetMuscles, accessoryMuscles, isCardio]
    );
    return result.lastInsertRowId;
  } catch (error) {
    if (error.message && error.message.includes("UNIQUE constraint failed")) {
      throw new Error("Exercise name must be unique.");
    }
    throw error;
  }
};

// Update existing exercise
export const updateExercise = async (exerciseID, exerciseName, targetMuscles, accessoryMuscles, isCardio = 0) => {
  const database = await getDb();
  try {
    await database.runAsync(
      `UPDATE exercises 
       SET name = ?, targetMuscle = ?, accessoryMuscles = ?, isCardio = ? 
       WHERE exerciseID = ?;`,
      [exerciseName, targetMuscles, accessoryMuscles, isCardio, exerciseID]
    );
    return "Exercise updated successfully!";
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
  await database.withTransactionAsync(async () => {
    for (const entry of workoutEntries) {
      await database.runAsync(
        `INSERT INTO workoutHistory 
        (workoutSession, exerciseNum, setNum, exerciseID, weight, reps, oneRM, time, name, pr, duration, setType, notes, is1rmPR, isVolumePR, isWeightPR, distance, seconds) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
          entry.setType || 'N',
          entry.notes || '',
          entry.is1rmPR || 0,
          entry.isVolumePR || 0,
          entry.isWeightPR || 0,
          entry.distance || null,
          entry.seconds || null
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

// Overwrite an existing workout session with new data.
export const overwriteWorkoutSession = async (sessionNumber, workoutEntries, workoutTitle, duration) => {
  const database = await getDb();
  let setsOverwritten = 0;

  try {
    const originalRows = await database.getAllAsync(
      `SELECT DISTINCT exerciseID FROM workoutHistory WHERE workoutSession = ?;`,
      [sessionNumber]
    );
    const originalExerciseIDs = originalRows.map(r => r.exerciseID);

    await database.withTransactionAsync(async () => {
      const deleteResult = await database.runAsync(
        `DELETE FROM workoutHistory WHERE workoutSession = ?;`,
        [sessionNumber]
      );

      console.log(`Deleted ${deleteResult.changes} existing sets for session ${sessionNumber}.`);

      for (const entry of workoutEntries) {
        await database.runAsync(
          `INSERT INTO workoutHistory 
           (workoutSession, exerciseNum, setNum, exerciseID, weight, reps, oneRM, time, name, pr, duration, setType, notes, is1rmPR, isVolumePR, isWeightPR, distance, seconds) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            sessionNumber,
            entry.exerciseNum,
            entry.setNum,
            entry.exerciseID,
            entry.weight,
            entry.reps,
            entry.oneRM,
            entry.time,
            workoutTitle,
            entry.pr || 0,
            duration,
            entry.setType || 'N',
            entry.notes || '',
            entry.is1rmPR || 0,
            entry.isVolumePR || 0,
            entry.isWeightPR || 0,
            entry.distance || null,
            entry.seconds || null
          ]
        );
        setsOverwritten++;
      }
    });

    console.log(`Workout session ${sessionNumber} overwritten successfully with ${setsOverwritten} sets.`);
    
    const newExerciseIDs = workoutEntries.map(e => e.exerciseID);
    const affectedExerciseIDs = [...new Set([...originalExerciseIDs, ...newExerciseIDs])];
    for (const exerciseID of affectedExerciseIDs) {
      await recalculateExercisePRs(exerciseID);
    }

    return setsOverwritten;
  } catch (error) {
    console.error('Error in overwriteWorkoutSession:', error);
    throw new Error(`Failed to overwrite workout session ${sessionNumber}: ${error.message}`);
  }
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
  
  const originalRows = await database.getAllAsync(
    `SELECT DISTINCT exerciseID FROM workoutHistory WHERE workoutSession = ?;`,
    [sessionNumber]
  );
  const affectedExerciseIDs = originalRows.map(r => r.exerciseID);

  await database.runAsync(
    `DELETE FROM workoutHistory WHERE workoutSession = ?;`,
    [sessionNumber]
  );

  for (const exerciseID of affectedExerciseIDs) {
    await recalculateExercisePRs(exerciseID);
  }
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

// Get workout session count per exercise (number of distinct sessions)
export const fetchExerciseWorkoutCounts = async () => {
  const database = await getDb();
  const rows = await database.getAllAsync(
    `SELECT exerciseID, COUNT(DISTINCT workoutSession) as workoutCount
     FROM workoutHistory
     GROUP BY exerciseID;`
  );
  const countMap = new Map();
  for (const row of rows) {
    countMap.set(row.exerciseID, row.workoutCount);
  }
  return countMap;
};

// Fetch the last workout sets for a specific exercise
export const fetchLastWorkoutSets = async (exerciseID) => {
  const database = await getDb();
  const lastSessionResult = await database.getFirstAsync(
    `SELECT MAX(workoutSession) as lastSession 
     FROM workoutHistory 
     WHERE exerciseID = ?;`,
    [exerciseID]
  );

  if (!lastSessionResult?.lastSession) return [];

  return await database.getAllAsync(
    `SELECT * FROM workoutHistory 
     WHERE exerciseID = ? AND workoutSession = ?
     ORDER BY setNum ASC;`,
    [exerciseID, lastSessionResult.lastSession]
  );
};

// Get current PRs for an exercise
export const getExercisePRs = async (exerciseID, excludeSessionNumber = null) => {
  const database = await getDb();

  let queryCond = `WHERE exerciseID = ? AND reps > 0`;
  let params = [exerciseID];

  if (excludeSessionNumber != null) {
    queryCond += ` AND workoutSession != ?`;
    params.push(excludeSessionNumber);
  }

  const result = await database.getFirstAsync(
    `SELECT 
      MAX(oneRM) as maxOneRM,
      MAX(weight * reps) as maxVolume,
      MAX(weight) as maxWeight
     FROM workoutHistory
     ${queryCond};`,
    params
  );

  const maxWeight = result?.maxWeight || 0;

  let repsQueryCond = `WHERE exerciseID = ? AND weight = ?`;
  let repsParams = [exerciseID, maxWeight];

  if (excludeSessionNumber != null) {
    repsQueryCond += ` AND workoutSession != ?`;
    repsParams.push(excludeSessionNumber);
  }

  const repsAtMaxWeight = maxWeight > 0 ? await database.getFirstAsync(
    `SELECT MAX(reps) as maxReps
     FROM workoutHistory
     ${repsQueryCond};`,
    repsParams
  ) : null;

  return {
    maxOneRM: result?.maxOneRM || 0,
    maxVolume: result?.maxVolume || 0,
    maxWeight: maxWeight,
    maxRepsAtMaxWeight: repsAtMaxWeight?.maxReps || 0
  };
};

// Check if PR (Deprecated in favor of manual check with getExercisePRs, but keeping for compatibility)
export const calculateIfPR = async (exerciseID, oneRM) => {
  const { maxOneRM } = await getExercisePRs(exerciseID);
  return oneRM > maxOneRM ? 1 : 0;
};

// Recalculate PRs for all sets of a given exercise
export const recalculateExercisePRs = async (exerciseID) => {
  const database = await getDb();
  
  const sets = await database.getAllAsync(
    `SELECT rowid, * FROM workoutHistory WHERE exerciseID = ? ORDER BY time ASC, workoutSession ASC, exerciseNum ASC, setNum ASC;`,
    [exerciseID]
  );
  
  const sessions = [];
  let currentKey = null;
  let currentSets = [];
  
  for (const set of sets) {
    const key = `${set.workoutSession}-${set.exerciseNum}`;
    if (key !== currentKey) {
      if (currentSets.length > 0) sessions.push(currentSets);
      currentKey = key;
      currentSets = [];
    }
    currentSets.push(set);
  }
  if (currentSets.length > 0) sessions.push(currentSets);
  
  let historicalBestOneRM = 0;
  let historicalBestVolume = 0;
  let historicalBestWeight = 0;
  let historicalBestRepsAtMaxWeight = 0;
  
  const updates = [];
  
  for (const sessionSets of sessions) {
    let maxOneRMInWorkout = 0;
    let maxVolumeInWorkout = 0;
    let maxWeightInWorkout = 0;
    let maxRepsAtMaxWeight = 0;
    let bestSetIndexOneRM = -1;
    let bestSetIndexVolume = -1;
    let bestSetIndexWeight = -1;
    
    sessionSets.forEach((set, idx) => {
      const oneRM = set.oneRM || 0;
      const weight = set.weight || 0;
      const reps = set.reps || 0;
      const volume = weight * reps;
      
      if (oneRM > maxOneRMInWorkout) {
        maxOneRMInWorkout = oneRM;
        bestSetIndexOneRM = idx;
      }
      if (volume > maxVolumeInWorkout) {
        maxVolumeInWorkout = volume;
        bestSetIndexVolume = idx;
      }
      if (reps > 0) {
        if (weight > maxWeightInWorkout) {
          maxWeightInWorkout = weight;
          maxRepsAtMaxWeight = reps;
          bestSetIndexWeight = idx;
        } else if (weight === maxWeightInWorkout && reps > maxRepsAtMaxWeight) {
          maxRepsAtMaxWeight = reps;
          bestSetIndexWeight = idx;
        }
      }
    });

    const is1rmPR = maxOneRMInWorkout > historicalBestOneRM;
    const isVolumePR = maxVolumeInWorkout > historicalBestVolume;
    const isWeightPR =
      maxWeightInWorkout > historicalBestWeight ||
      (maxWeightInWorkout === historicalBestWeight && maxRepsAtMaxWeight > historicalBestRepsAtMaxWeight);

    if (is1rmPR) historicalBestOneRM = maxOneRMInWorkout;
    if (isVolumePR) historicalBestVolume = maxVolumeInWorkout;
    if (isWeightPR) {
      historicalBestWeight = maxWeightInWorkout;
      historicalBestRepsAtMaxWeight = maxRepsAtMaxWeight;
    }

    sessionSets.forEach((set, idx) => {
      const isThisSet1rmPR = (is1rmPR && idx === bestSetIndexOneRM) ? 1 : 0;
      const isThisSetVolumePR = (isVolumePR && idx === bestSetIndexVolume) ? 1 : 0;
      const isThisSetWeightPR = (isWeightPR && idx === bestSetIndexWeight) ? 1 : 0;
      const isLegacyPR = isThisSet1rmPR;
      
      if (set.is1rmPR !== isThisSet1rmPR || 
          set.isVolumePR !== isThisSetVolumePR || 
          set.isWeightPR !== isThisSetWeightPR ||
          set.pr !== isLegacyPR) {
          updates.push({
            rowid: set.rowid,
            is1rmPR: isThisSet1rmPR,
            isVolumePR: isThisSetVolumePR,
            isWeightPR: isThisSetWeightPR,
            pr: isLegacyPR
          });
      }
    });
  }
  
  if (updates.length > 0) {
    await database.withTransactionAsync(async () => {
      for (const update of updates) {
        await database.runAsync(
          `UPDATE workoutHistory SET is1rmPR = ?, isVolumePR = ?, isWeightPR = ?, pr = ? WHERE rowid = ?;`,
          [update.is1rmPR, update.isVolumePR, update.isWeightPR, update.pr, update.rowid]
        );
      }
    });
  }
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
    `SELECT time, oneRM, weight, reps, setType 
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
      COUNT(*) as sets,
      MAX(wh.time) as date
     FROM workoutHistory wh
     JOIN exercises e ON wh.exerciseID = e.exerciseID
     WHERE wh.time >= ? AND (wh.setType IS NULL OR wh.setType != 'W')
     GROUP BY wh.workoutSession, wh.exerciseID, e.targetMuscle, e.accessoryMuscles;`,
    [cutoffDate.toISOString()]
  );
};

// --- Template Functions ---

export const createTemplate = async (name, workoutData) => {
  const database = await getDb();
  try {
    const dataString = JSON.stringify(workoutData);
    const result = await database.runAsync(
      `INSERT INTO workoutTemplates (name, data, createdAt) VALUES (?, ?, ?);`,
      [name, dataString, new Date().toISOString()]
    );
    return result.lastInsertRowId;
  } catch (error) {
    console.error('Error creating template:', error);
    throw error;
  }
};

export const getTemplates = async () => {
  const database = await getDb();
  try {
    const rows = await database.getAllAsync('SELECT * FROM workoutTemplates ORDER BY id DESC;');
    return rows.map(row => ({
      ...row,
      data: JSON.parse(row.data)
    }));
  } catch (error) {
    console.error('Error fetching templates:', error);
    return [];
  }
};

export const getTemplate = async (id) => {
  const database = await getDb();
  try {
    const row = await database.getFirstAsync('SELECT * FROM workoutTemplates WHERE id = ?;', [id]);
    if (row) {
      return {
        ...row,
        data: JSON.parse(row.data)
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching template:', error);
    return null;
  }
};

export const deleteTemplate = async (id) => {
  const database = await getDb();
  try {
    await database.runAsync('DELETE FROM workoutTemplates WHERE id = ?;', [id]);
  } catch (error) {
    console.error('Error deleting template:', error);
    throw error;
  }
};

export const updateTemplate = async (id, name, workoutData) => {
  const database = await getDb();
  try {
    const dataString = JSON.stringify(workoutData);
    await database.runAsync(
      `UPDATE workoutTemplates SET name = ?, data = ? WHERE id = ?;`,
      [name, dataString, id]
    );
  } catch (error) {
    console.error('Error updating template:', error);
    throw error;
  }
};

export const importStrongData = async (csvContent, progressCallback = null) => {
  const database = await getDb();

  const cleanFloat = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const cleanup = val.toString().replace(/,/g, '').replace(/[^\d.-]/g, '');
    return parseFloat(cleanup) || 0;
  };

  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          const totalRows = rows.length;

          if (progressCallback) {
            progressCallback({ stage: 'parsing', current: totalRows, total: totalRows });
          }

          console.log("First row keys:", Object.keys(rows[0]));
          console.log("First row sample:", rows[0]);

          const workoutMap = new Map();
          const notesMap = new Map();
          const bodyWeightEntries = [];

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            if (!row['Date'] || !row['Exercise Name']) continue;

            const date = new Date(row['Date']).toISOString();
            const exerciseName = row['Exercise Name'].trim();

            if (exerciseName.toLowerCase() === 'body weight' || exerciseName.toLowerCase() === 'weight') {
              const weight = parseFloat(row['Weight (kg)']) || 0;
              if (weight > 0) {
                bodyWeightEntries.push({ date, weight });
              }
              continue;
            }

            // FIX: Group by minute precision so that rows with millisecond-differing
            // timestamps (from Sisyphus exports) all land in the same session.
            // Strong exports use identical timestamps; Sisyphus exports use per-row
            // timestamps milliseconds apart — both collapse correctly to the same minute bucket.
            const d = new Date(row['Date']);
            const dateKey = Math.floor(d.getTime() / 60000) * 60000;

            const setOrderRaw = row['Set Order'] ? row['Set Order'].toString().trim() : '';

            if (setOrderRaw.toLowerCase() === 'note') {
              if (!notesMap.has(dateKey)) {
                notesMap.set(dateKey, new Map());
              }
              const sessionNotes = notesMap.get(dateKey);
              sessionNotes.set(exerciseName, row['Notes'] || '');
              continue;
            }

            if (setOrderRaw.toLowerCase().includes('timer')) {
              continue;
            }

            const weight = parseFloat(row['Weight (kg)']) || 0;
            const reps = parseInt(row['Reps'], 10) || 0;
            const durationSeconds = parseInt(row['Duration (sec)'], 10) || 0;
            const durationMinutes = Math.floor(durationSeconds / 60);
            const workoutTitle = row['Workout Name'] || 'Strong Import';

            const keys = Object.keys(row);
            const distKey = keys.find(k => k.toLowerCase().includes('distance') || k.toLowerCase().includes('meters'));
            const timeKey = keys.find(k => k.toLowerCase() === 'seconds' || k.toLowerCase() === 'time');

            const isKmHeader = distKey ? distKey.toLowerCase().includes('km') : false;
            const distanceVal = distKey ? row[distKey] : 0;
            const distanceRaw = cleanFloat(distanceVal);

            const timeVal = timeKey ? row[timeKey] : 0;
            const cardiosSeconds = cleanFloat(timeVal);

            const distanceKm = isKmHeader ? distanceRaw : (distanceRaw > 0 ? distanceRaw / 1000 : 0);

            const isCardioSet = (distanceRaw > 0 || cardiosSeconds > 0) && !setOrderRaw.toLowerCase().includes('timer');

            // Detect warmup/drop set type from Set Order
            let setType = 'N';
            if (setOrderRaw.toUpperCase() === 'W') {
              setType = 'W';
            } else if (setOrderRaw.toUpperCase() === 'D') {
              setType = 'D';
            }

            // Calculate 1RM
            let oneRM;
            if (reps === 0) {
              oneRM = 0;
            } else if (reps === 1) {
              oneRM = weight;
            } else {
              oneRM = weight * (1 + reps / 30);
            }

            const setData = {
              exerciseName,
              weight,
              reps,
              oneRM,
              date,
              workoutTitle,
              durationMinutes,
              setType,
              distance: distanceKm > 0 ? distanceKm : null,
              seconds: cardiosSeconds > 0 ? cardiosSeconds : null,
              isCardio: isCardioSet,
              notes: row['Notes'] || ''
            };

            if (!workoutMap.has(dateKey)) {
              workoutMap.set(dateKey, new Map());
            }

            const exerciseMap = workoutMap.get(dateKey);
            if (!exerciseMap.has(exerciseName)) {
              exerciseMap.set(exerciseName, []);
            }

            exerciseMap.get(exerciseName).push(setData);
          }

          const sortedDateKeys = Array.from(workoutMap.keys()).sort((a, b) => a - b);

          if (progressCallback) {
            progressCallback({ stage: 'preparing', current: 0, total: sortedDateKeys.length });
          }

          const currentMaxSession = await database.getFirstAsync(
            'SELECT MAX(workoutSession) as maxSession FROM workoutHistory'
          );
          let nextSessionNumber = (currentMaxSession?.maxSession || 0) + 1;

          const exerciseBestOneRM = new Map();
          const exerciseBestVolume = new Map();
          const exerciseBestWeight = new Map();
          const exerciseBestRepsAtMaxWeight = new Map();
          let importedCount = 0;

          const processedExercises = new Set();

          await database.withTransactionAsync(async () => {
            for (const entry of bodyWeightEntries) {
              await database.runAsync(
                `INSERT OR REPLACE INTO bodyWeight (datetime, weight) VALUES (?, ?);`,
                [entry.date, entry.weight]
              );
            }

            for (let sessionIdx = 0; sessionIdx < sortedDateKeys.length; sessionIdx++) {
              const dateKey = sortedDateKeys[sessionIdx];
              const workoutSession = nextSessionNumber;
              nextSessionNumber++;

              const exerciseMap = workoutMap.get(dateKey);
              const sessionNotes = notesMap.get(dateKey);

              let exerciseNumInSession = 1;

              for (const [exerciseName, sets] of exerciseMap.entries()) {
                let exerciseID;
                const existingExercise = await database.getFirstAsync(
                  'SELECT exerciseID, isCardio FROM exercises WHERE name = ?',
                  [exerciseName]
                );

                const hasCardioData = sets.some(s => s.isCardio);

                if (existingExercise) {
                  exerciseID = existingExercise.exerciseID;

                  if (!processedExercises.has(exerciseName)) {
                    await database.runAsync('UPDATE exercises SET isCardio = 0 WHERE exerciseID = ?', [exerciseID]);
                    processedExercises.add(exerciseName);
                  }

                  if (hasCardioData) {
                    await database.runAsync('UPDATE exercises SET isCardio = 1 WHERE exerciseID = ?', [exerciseID]);
                  }
                } else {
                  const result = await database.runAsync(
                    'INSERT INTO exercises (name, targetMuscle, accessoryMuscles, isCardio) VALUES (?, ?, ?, ?)',
                    [exerciseName, '', '', hasCardioData ? 1 : 0]
                  );
                  exerciseID = result.lastInsertRowId;
                }

                const note = sessionNotes ? sessionNotes.get(exerciseName) : '';

                const historicalBestOneRM = exerciseBestOneRM.get(exerciseID) || 0;
                const historicalBestVolume = exerciseBestVolume.get(exerciseID) || 0;
                const historicalBestWeight = exerciseBestWeight.get(exerciseID) || 0;
                const historicalBestRepsAtMaxWeight = exerciseBestRepsAtMaxWeight.get(exerciseID) || 0;

                let maxOneRMInWorkout = 0;
                let maxVolumeInWorkout = 0;
                let maxWeightInWorkout = 0;
                let maxRepsAtMaxWeight = 0;
                let bestSetIndexOneRM = -1;
                let bestSetIndexVolume = -1;
                let bestSetIndexWeight = -1;

                sets.forEach((set, idx) => {
                  if (set.oneRM > maxOneRMInWorkout) {
                    maxOneRMInWorkout = set.oneRM;
                    bestSetIndexOneRM = idx;
                  }
                  const volume = set.weight * set.reps;
                  if (volume > maxVolumeInWorkout) {
                    maxVolumeInWorkout = volume;
                    bestSetIndexVolume = idx;
                  }
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
                const isWeightPR =
                  maxWeightInWorkout > historicalBestWeight ||
                  (maxWeightInWorkout === historicalBestWeight && maxRepsAtMaxWeight > historicalBestRepsAtMaxWeight);

                if (is1rmPR) exerciseBestOneRM.set(exerciseID, maxOneRMInWorkout);
                if (isVolumePR) exerciseBestVolume.set(exerciseID, maxVolumeInWorkout);
                if (isWeightPR) {
                  exerciseBestWeight.set(exerciseID, maxWeightInWorkout);
                  exerciseBestRepsAtMaxWeight.set(exerciseID, maxRepsAtMaxWeight);
                }

                // FIX: Use array index (i + 1) for setNum — format-agnostic.
                // The CSV's Set Order values (W, 2, 3, 4 or W, 1, 2, 3) are unreliable
                // across export formats, so we ignore them for ordering and just sequence
                // sets in the order they appeared in the CSV.
                for (let i = 0; i < sets.length; i++) {
                  const set = sets[i];
                  const setNum = i + 1;
                  const isThisSet1rmPR = (is1rmPR && i === bestSetIndexOneRM) ? 1 : 0;
                  const isThisSetVolumePR = (isVolumePR && i === bestSetIndexVolume) ? 1 : 0;
                  const isThisSetWeightPR = (isWeightPR && i === bestSetIndexWeight) ? 1 : 0;
                  const isLegacyPR = isThisSet1rmPR;

                  await database.runAsync(
                    `INSERT INTO workoutHistory 
                    (workoutSession, exerciseNum, setNum, exerciseID, weight, reps, oneRM, time, name, pr, duration, setType, notes, is1rmPR, isVolumePR, isWeightPR, distance, seconds) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                    [
                      workoutSession,
                      exerciseNumInSession,
                      setNum,
                      exerciseID,
                      set.weight,
                      set.reps,
                      set.oneRM,
                      set.date,
                      set.workoutTitle,
                      isLegacyPR,
                      set.durationMinutes,
                      set.setType,
                      set.notes || note,
                      isThisSet1rmPR,
                      isThisSetVolumePR,
                      isThisSetWeightPR,
                      set.distance,
                      set.seconds
                    ]
                  );

                  importedCount++;
                }

                exerciseNumInSession++;
              }

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

export const exportWorkoutData = async () => {
  const database = await getDb();
  try {
    const rows = await database.getAllAsync(`
      SELECT 
        wh.time as Date,
        wh.name as [Workout Name],
        e.name as [Exercise Name],
        wh.setNum as [Set Order],
        wh.weight as [Weight (kg)],
        wh.reps as Reps,
        wh.distance as Distance,
        wh.seconds as Seconds,
        wh.duration as Duration,
        wh.notes as Notes,
        wh.setType as SetType
      FROM workoutHistory wh
      JOIN exercises e ON wh.exerciseID = e.exerciseID
      ORDER BY wh.time ASC, wh.exerciseNum ASC, wh.setNum ASC;
    `);

    const formattedRows = rows.map(row => {
      let setOrder = row['Set Order'];
      if (row.SetType === 'W') setOrder = 'W';
      else if (row.SetType === 'D') setOrder = 'D';

      return {
        'Date': row.Date,
        'Workout Name': row['Workout Name'],
        'Exercise Name': row['Exercise Name'],
        'Set Order': setOrder,
        'Weight (kg)': row['Weight (kg)'],
        'Reps': row.Reps,
        'Distance (km)': row.Distance,
        'Duration (sec)': (row.Duration || 0) * 60,
        'Seconds': row.Seconds,
        'Notes': row.Notes
      };
    });

    const csv = Papa.unparse(formattedRows);
    return csv;
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
};

// --- Body Weight Functions ---

export const insertBodyWeight = async (date, weight) => {
  const database = await getDb();
  try {
    await database.runAsync(
      `INSERT OR REPLACE INTO bodyWeight (datetime, weight) VALUES (?, ?);`,
      [date, weight]
    );
    return "Weight logged successfully!";
  } catch (error) {
    console.error("Error logging body weight:", error);
    throw error;
  }
};

export const getBodyWeightHistory = async () => {
  const database = await getDb();
  try {
    return await database.getAllAsync('SELECT * FROM bodyWeight ORDER BY datetime ASC;');
  } catch (error) {
    console.error("Error fetching body weight history:", error);
    return [];
  }
};

export const getLatestBodyWeight = async () => {
  const database = await getDb();
  try {
    return await database.getFirstAsync('SELECT * FROM bodyWeight ORDER BY datetime DESC LIMIT 1;');
  } catch (error) {
    console.error("Error fetching latest body weight:", error);
    return null;
  }
};

export const importBodyWeightData = async (csvContent) => {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().replace(/^"|"$/g, ''),
      complete: async (results) => {
        try {
          const rows = results.data;
          let importedCount = 0;

          await database.withTransactionAsync(async () => {
            for (const row of rows) {
              const keys = Object.keys(row);
              const dateKey = keys.find(k => k.toLowerCase().includes('date'));
              const weightKey = keys.find(k => k.toLowerCase().includes('weight') && k.toLowerCase().includes('kg'));

              if (!dateKey || !weightKey) continue;

              const rawDate = row[dateKey];
              const rawWeight = row[weightKey];

              if (!rawDate || !rawWeight) continue;

              const dateObj = new Date(rawDate);
              if (isNaN(dateObj.getTime())) continue;

              const date = dateObj.toISOString();

              const weightStr = rawWeight.toString().replace(/"/g, '').replace(',', '.');
              const weight = parseFloat(weightStr);

              if (isNaN(weight)) continue;

              await database.runAsync(
                `INSERT OR REPLACE INTO bodyWeight (datetime, weight) VALUES (?, ?);`,
                [date, weight]
              );
              importedCount++;
            }
          });

          resolve(importedCount);
        } catch (error) {
          console.error("Error importing body weight data:", error);
          reject(error);
        }
      },
      error: (error) => {
        console.error("Papa Parse Error:", error);
        reject(error);
      }
    });
  });
};

export const deleteBodyWeight = async (date) => {
  const database = await getDb();
  try {
    await database.runAsync(
      `DELETE FROM bodyWeight WHERE datetime = ?;`,
      [date]
    );
    return "Weight deleted successfully!";
  } catch (error) {
    console.error("Error deleting body weight:", error);
    throw error;
  }
};

export const exportBodyWeightData = async () => {
  const database = await getDb();
  try {
    const rows = await database.getAllAsync('SELECT datetime as Date, weight as [Weight (kg)] FROM bodyWeight ORDER BY datetime ASC;');
    const csv = Papa.unparse(rows);
    return csv;
  } catch (error) {
    console.error('Body weight export error:', error);
    throw error;
  }
};