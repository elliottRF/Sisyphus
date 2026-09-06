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
 * formatWeight for a field the user may have left empty.
 *
 * formatWeight(null) is NaN, and NaN.toFixed() is the string "NaN", so a blank
 * template set rendered through it shows "NaN" in the weight box — and on save,
 * toStorageKg("NaN") is 0, quietly turning "blank" into "zero kilos". The same
 * save path stores every blank as 0, so a template that has been saved once
 * holds 0 where the user typed nothing. Both are treated as blank here (null),
 * which is what current.jsx already does when loading a template into a
 * workout, so the two screens agree. A 0 round-trips back to 0 on save, so
 * nothing is lost for bodyweight exercises.
 */
export const formatWeightOrBlank = (kg, useImperial, decimals = 1) => {
    const n = parseFloat(kg);
    if (isNaN(n) || n === 0) return null;
    return formatWeight(n, useImperial, decimals);
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
