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
        `CREATE TABLE IF NOT EXISTS currentWorkout (
          workoutNum INTEGER,
          setNum INTEGER,
          exerciseID INTEGER,
          weight FLOAT,
          reps INTEGER,
          PRIMARY KEY (workoutNum, setNum),
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

      // Check if currentWorkout table is empty before populating with debugging data
      tx.executeSql(
        'SELECT COUNT(*) as count FROM currentWorkout;',
        [],
        (_, { rows }) => {
          const count = rows._array[0].count;
          
          // Only populate if the table is empty
          if (count === 0) {
            const debuggingWorkout = [
              { workoutNum: 1, setNum: 1, exerciseID: 1, weight: 0, reps: 20 },
              { workoutNum: 1, setNum: 2, exerciseID: 1, weight: 0, reps: 25 },
              { workoutNum: 2, setNum: 1, exerciseID: 2, weight: 50, reps: 12 }, 
              { workoutNum: 2, setNum: 2, exerciseID: 2, weight: 55, reps: 10 },
              { workoutNum: 3, setNum: 1, exerciseID: 3, weight: 100, reps: 8 },
              { workoutNum: 3, setNum: 2, exerciseID: 3, weight: 110, reps: 6 }
            ];

            debuggingWorkout.forEach(({ workoutNum, setNum, exerciseID, weight, reps }) => {
              tx.executeSql(
                `INSERT INTO currentWorkout (workoutNum, setNum, exerciseID, weight, reps) 
                VALUES (?, ?, ?, ?, ?);`,
                [workoutNum, setNum, exerciseID, weight, reps]
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
export const fetchCurrentWorkout = () => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM currentWorkout;`,
        [],
        (_, { rows }) => resolve(rows._array),
        (_, error) => reject(error)
      );
    });
  });
};