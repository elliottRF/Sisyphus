export const REP_RANGE_PRESETS = [
  {
    key: 'strength',
    title: 'Low',
    range: '3-6 reps',
    description: 'Lower reps with heavier work.',
  },
  {
    key: 'balanced',
    title: 'Moderate',
    range: '6-12 reps',
    description: 'A middle ground for size and strength.',
  },
  {
    key: 'hypertrophy',
    title: 'High',
    range: '12-15 reps',
    description: 'Higher reps with a muscle-building bias.',
  },
];

export const DEFAULT_REP_RANGE_PRESET = REP_RANGE_PRESETS[1].key;
export const REP_RANGE_MIN = 2;
export const REP_RANGE_MAX = 16;
export const DEFAULT_REP_RANGE = {
  min: 6,
  max: 12,
};

export const SETTINGS_KEYS = {
  repRangePreset: 'user_rep_range_preset',
  repRangeMin: 'user_rep_range_min',
  repRangeMax: 'user_rep_range_max',
  onboardingSeen: 'user_onboarding_seen_v1',
};
