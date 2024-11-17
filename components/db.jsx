import * as SQLite from 'expo-sqlite';

import exerciseData from '../assets/exercises.json';

// Open or create the database
const db = SQLite.openDatabase('sisyphus.db');

// Create and populate the exercises table
export const setupDatabase = () => {
  db.transaction(tx => {
    tx.executeSql('PRAGMA foreign_keys = ON;');
    // Create the table if it doesn't exist
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


    exerciseData.forEach(({ exerciseID, name, targetMuscle, accessoryMuscles }) => {
      tx.executeSql(
        `INSERT OR REPLACE INTO exercises (exerciseID, name, targetMuscle, accessoryMuscles) 
        VALUES (?, ?, ?, ?);`,
        [exerciseID, name, targetMuscle, accessoryMuscles]
      );
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
