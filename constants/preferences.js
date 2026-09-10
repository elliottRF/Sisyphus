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

// How far back the suggestion engine looks for the session to progress
// from. Longer means it chases an older, usually harder best; shorter
// means it follows what you have been doing lately. 0 means no cutoff.
//
// Nothing breaks at the short end: if no session for an exercise falls
// inside the window, the engine falls back to that exercise's most recent
// session however old it is.
export const PR_LOOKBACK_OPTIONS = [
  { days: 30, label: '1m', name: '1 month' },
  { days: 60, label: '2m', name: '2 months' },
  { days: 90, label: '3m', name: '3 months' },
  { days: 180, label: '6m', name: '6 months' },
  { days: 0, label: 'All', name: 'All time' },
];

export const DEFAULT_PR_LOOKBACK_DAYS = 60;

export const prLookbackName = (days) =>
  (PR_LOOKBACK_OPTIONS.find((o) => o.days === days) || PR_LOOKBACK_OPTIONS[1]).name;

export const SETTINGS_KEYS = {
  repRangePreset: 'user_rep_range_preset',
  repRangeMin: 'user_rep_range_min',
  repRangeMax: 'user_rep_range_max',
  onboardingSeen: 'user_onboarding_seen_v1',
  alternateView: 'user_alternate_view',
  trackRPE: 'user_track_rpe',
  gymEquipment: 'user_gym_equipment',
  prLookbackDays: 'user_pr_lookback_days',
};
