// Unit conversion utilities for kg / lbs support.
// All weights in the database are stored in kg.
// These helpers handle display conversion and input→storage conversion.

export const LBS_PER_KG = 2.20462;

/** Convert a stored kg value to lbs */
export const kgToLbs = (kg) => parseFloat(kg) * LBS_PER_KG;

/** Convert a user-entered lbs value to kg for storage */
export const lbsToKg = (lbs) => parseFloat(lbs) / LBS_PER_KG;

/**
 * Return a numeric display value in the user's preferred unit.
 * @param {number} kg - value stored in the database (always kg)
 * @param {boolean} useImperial - true if the user prefers lbs
 * @param {number} decimals - decimal places (default 1)
 */
export const formatWeight = (kg, useImperial, decimals = 1) => {
    const val = useImperial ? kgToLbs(kg) : parseFloat(kg);
    return parseFloat(val.toFixed(decimals));
};

/**
 * Return a formatted string with unit label, e.g. "82.5 kg" or "181.9 lbs".
 */
export const formatWeightLabel = (kg, useImperial, decimals = 1) => {
    return `${formatWeight(kg, useImperial, decimals)} ${useImperial ? 'lbs' : 'kg'}`;
};

/**
 * Convert a user-entered weight string to kg for database storage.
 * If useImperial is false, the value is treated as already in kg.
 */
export const toStorageKg = (val, useImperial) => {
    const n = parseFloat(val);
    if (isNaN(n)) return 0;
    return useImperial ? lbsToKg(n) : n;
};

/** Unit label string: "kg" or "lbs" */
export const unitLabel = (useImperial) => (useImperial ? 'lbs' : 'kg');
