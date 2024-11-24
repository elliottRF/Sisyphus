import * as SQLite from 'expo-sqlite';
import exerciseData from '../assets/exercises.json';

// Open or create the database
const db = SQLite.openDatabase('sisyphus.db');

// Create and populate the exercises table
export const setupDatabase = () => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('PRAGMA foreign_keys = ON;');
      
      // Create the tables if they don't exist
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS exercises (
          exerciseID INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          targetMuscle TEXT NOT NULL,
          accessoryMuscles TEXT
        );`
      );

      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS workoutHistory (
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
          FOREIGN KEY (exerciseID) REFERENCES exercises(exerciseID)
        );`
      );

      // Check if exercises table is empty before populating
      tx.executeSql(
        'SELECT COUNT(*) as count FROM exercises;',
        [],
        (_, { rows }) => {
          const count = rows._array[0].count;
          
          // Only populate if the table is empty
          if (count === 0) {
            exerciseData.forEach(({ exerciseID, name, targetMuscle, accessoryMuscles }) => {
              tx.executeSql(
                `INSERT OR REPLACE INTO exercises (exerciseID, name, targetMuscle, accessoryMuscles) 
                VALUES (?, ?, ?, ?);`,
                [exerciseID, name, targetMuscle, accessoryMuscles]
              );
            });
          }
        }
      );
    }, 

    (error) => {
      console.error('Database setup error:', error);
      reject(error);
    },
    () => {
      console.log('Database setup completed successfully');
      resolve();
    });
  });
};

// Fetch all exercises from the database
export const fetchExercises = () => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM exercises;`,
        [],
        (_, { rows }) => resolve(rows._array),
        (_, error) => reject(error)
      );
    });
  });
};

// Fetch all exercises from the database
export const fetchWorkoutHistory = () => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM workoutHistory;`,
        [],
        (_, { rows }) => resolve(rows._array),
        (_, error) => reject(error)
      );
    });
  });
};


// Get the latest workout session number
export const getLatestWorkoutSession = () => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT MAX(workoutSession) as latestSession FROM workoutHistory;`,
        [],
        (_, { rows }) => {
          const latestSession = rows._array[0].latestSession;
          resolve(latestSession !== null ? latestSession : 0);
        },
        (_, error) => reject(error)
      );
    });
  });
};

// Insert workout history entries
export const insertWorkoutHistory = (workoutEntries, workoutTitle) => {
  return new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        workoutEntries.forEach(entry => {
          tx.executeSql(
            `INSERT INTO workoutHistory 
            (workoutSession, exerciseNum, setNum, exerciseID, weight, reps, oneRM, time, name, pr) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
              entry.pr
            ]
          );
        });
      },
      error => reject(error),
      () => resolve()
    ); // Fixed: Added the missing closing parenthesis
  });
};

// Fetch workout history for a specific session
export const fetchWorkoutHistoryBySession = (sessionNumber) => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT wh.*, e.name as exerciseName 
         FROM workoutHistory wh
         JOIN exercises e ON wh.exerciseID = e.exerciseID
         WHERE workoutSession = ?
         ORDER BY exerciseNum, setNum;`,
        [sessionNumber],
        (_, { rows }) => resolve(rows._array),
        (_, error) => reject(error)
      );
    });
  });
};

// Calculate total volume for a specific workout session
export const calculateSessionVolume = (sessionNumber) => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT 
          SUM(weight * reps) as totalVolume,
          COUNT(DISTINCT exerciseID) as uniqueExercises
         FROM workoutHistory
         WHERE workoutSession = ?;`,
        [sessionNumber],
        (_, { rows }) => resolve(rows._array[0]),
        (_, error) => reject(error)
      );
    });
  });
};

// Delete a specific workout session
export const deleteWorkoutSession = (sessionNumber) => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `DELETE FROM workoutHistory WHERE workoutSession = ?;`,
        [sessionNumber],
        () => resolve(),
        (_, error) => reject(error)
      );
    });
  });
};

// Fetch exercise history for a specific exerciseID
export const fetchExerciseHistory = (exerciseID) => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM workoutHistory
          WHERE exerciseID= ?;`,
        [exerciseID],
        (_, { rows }) => resolve(rows._array),
        (_, error) => reject(error)
      );
    });
  });
};

//
export const calculateIfPR = (exerciseID, oneRM) => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT 
          MAX(oneRM) as maxOneRM
         FROM workoutHistory
         WHERE exerciseID = ?;`,
        [exerciseID],
        (_, { rows }) => {
          const maxOneRM = rows._array[0]?.maxOneRM || 0;
          // Check if the provided oneRM is greater than the existing max oneRM
          if (oneRM > maxOneRM) {
            resolve(1);  // PR (Personal Record) achieved
          } else {
            resolve(0);  // No PR
          }
        },
        (_, error) => reject(error)
      );
    });
  });
};