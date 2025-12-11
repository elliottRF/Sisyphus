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

                    // First pass: validate and group data
                    for (let i = 0; i < rows.length; i++) {
                        const row = rows[i];

                        // Validate Row
                        if (!row['Date'] || !row['Exercise Name']) continue;
                        if (row['Set Order'] === 'Note') continue;

                        // Parse Data
                        const date = new Date(row['Date']).toISOString();
                        const exerciseName = row['Exercise Name'].trim();
                        const weight = parseFloat(row['Weight (kg)']) || 0;
                        const reps = parseInt(row['Reps'], 10) || 0;
                        const durationSeconds = parseInt(row['Duration (sec)'], 10) || 0;
                        const durationMinutes = Math.floor(durationSeconds / 60);
                        const workoutTitle = row['Workout Name'] || 'Strong Import';
                        const workoutSession = new Date(row['Date']).getTime();

                        let setNum = parseInt(row['Set Order'], 10);
                        if (isNaN(setNum)) setNum = 1;

                        // Calculate 1RM
                        let oneRM;
                        if (reps === 0) {
                            oneRM = 0;
                        } else if (reps === 1) {
                            oneRM = weight;
                        } else {
                            oneRM = weight * (1 + reps / 30);
                        }

                        // Store set data
                        const setData = {
                            exerciseName,
                            weight,
                            reps,
                            oneRM,
                            setNum,
                            date,
                            workoutTitle,
                            durationMinutes
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
                                        [exerciseName, '', '']
                                    );
                                    exerciseID = result.lastInsertRowId;
                                }

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
                    (workoutSession, exerciseNum, setNum, exerciseID, weight, reps, oneRM, time, name, pr, duration) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
                                            set.durationMinutes
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
