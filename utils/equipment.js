// How the weight on an exercise is actually made up.
//
// The progressive-overload engine used to round every suggestion to 2.5 kg
// (or 5 lb), which is right for a barbell with 1.25 kg plates and wrong for
// everything else: a pin-loaded stack that jumps in 7 kg steps, a dumbbell
// rack that goes 2.5 kg to 30 kg and then 5 kg, an EZ bar that weighs 9 kg
// rather than 20. Suggesting a weight the machine cannot make is worse than
// suggesting nothing, because it quietly teaches the user to ignore the
// column.
//
// So each exercise can carry an equipment profile describing the weights it
// can actually produce, and suggestions snap to that set. Everything here is
// pure and works in KILOGRAMS -- the storage unit for the whole app. The UI
// converts at its own boundary with utils/units.js.
//
// An exercise with no profile behaves exactly as it did before. That is
// deliberate: every existing install starts with no profiles, and nobody's
// suggestions should move until they tell us what their gym has.

export const EQUIPMENT = {
    NONE: 'none',
    BARBELL: 'barbell',
    DUMBBELL: 'dumbbell',
    STACK: 'stack',
};

export const EQUIPMENT_LABELS = {
    [EQUIPMENT.NONE]: 'Not set',
    [EQUIPMENT.BARBELL]: 'Barbell',
    [EQUIPMENT.DUMBBELL]: 'Dumbbells',
    [EQUIPMENT.STACK]: 'Weight stack',
};

// ── Defaults ────────────────────────────────────────────────────────────────
// Two sets, because a gym stocked in kg and one stocked in lb have genuinely
// different hardware -- a 20 kg bar is not a 45 lb bar, and neither rounds to
// the other. Chosen once, when the user first opens the gym editor, from the
// unit they already work in; after that it is just their data.

const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
// 45, 35, 25, 10, 5, 2.5 lb expressed in kg.
const LB_PLATES = [20.4117, 15.8757, 11.3398, 4.5359, 2.268, 1.134];

export const defaultGym = (useImperial = false) => (useImperial
    ? {
        bar: 20.4117,                                        // 45 lb
        plates: LB_PLATES.map((w) => ({ w, count: 4 })),
        ladder: { min: 2.268, max: 45.3592, step: 2.268 },    // 5-100 lb in 5s
    }
    : {
        bar: 20,
        plates: KG_PLATES.map((w) => ({ w, count: 4 })),
        ladder: { min: 2.5, max: 40, step: 2.5 },
    });

// ── Parsing ─────────────────────────────────────────────────────────────────

const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
};

const numList = (v) => (Array.isArray(v) ? v.map(num).filter((n) => n != null && n >= 0) : []);

const plateList = (v) => {
    if (!Array.isArray(v)) return null;
    const out = [];
    for (const p of v) {
        const w = num(p && p.w);
        const count = num(p && p.count);
        if (w == null || w <= 0) continue;
        out.push({ w, count: Math.max(1, Math.min(20, Math.round(count == null ? 4 : count))) });
    }
    return out.length ? out.sort((a, b) => b.w - a.w) : null;
};

/**
 * Read the JSON blob stored on exercises.equipment.
 * Anything unparseable, unknown or empty reads as "no profile" (null), which
 * every consumer treats as the behaviour that shipped before this existed.
 */
export const parseEquipment = (raw) => {
    if (!raw) return null;
    let cfg = raw;
    if (typeof raw === 'string') {
        try { cfg = JSON.parse(raw); } catch (_) { return null; }
    }
    if (!cfg || typeof cfg !== 'object') return null;
    const type = cfg.type;

    if (type === EQUIPMENT.BARBELL) {
        return {
            type,
            bar: num(cfg.bar),                       // null = use the gym default
            plates: plateList(cfg.plates),           // null = use the gym default
            perSide: cfg.perSide !== false,          // default: loads in pairs
        };
    }
    if (type === EQUIPMENT.DUMBBELL) {
        const l = cfg.ladder;
        const ladder = l && num(l.min) != null && num(l.max) != null && num(l.step) != null
            ? { min: num(l.min), max: num(l.max), step: num(l.step) }
            : null;
        return {
            type,
            ladder,
            extra: numList(cfg.extra),
            pair: cfg.pair === true,                 // logged weight is both hands
        };
    }
    if (type === EQUIPMENT.STACK) {
        return {
            type,
            stack: numList(cfg.stack).sort((a, b) => a - b),
            addOns: numList(cfg.addOns).slice(0, 3),
        };
    }
    return null;
};

export const serialiseEquipment = (cfg) => {
    if (!cfg || cfg.type === EQUIPMENT.NONE) return null;
    return JSON.stringify(cfg);
};

// ── The set of weights a piece of equipment can actually make ───────────────

const EPS = 1e-6;
const key = (v) => Math.round(v * 1000);

// Every load a plate inventory can build, with the cheapest way to build each.
// "Cheapest" is fewest plates, which is also the fastest to load and the
// easiest to read off a card between sets.
//
// Bounded by arithmetic rather than combinatorics: distinct sums can only land
// on multiples of the finest plate, so a rack of 25 kg down to 1.25 kg with
// four pairs of each produces a couple of hundred sums, not 5^7 of them.
/**
 * The plate breakdown as a flat list of individual plate weights, heaviest
 * first -- the order they go on the sleeve.
 */
export const flattenCombo = (combo) => {
    const out = [];
    for (const c of combo || []) for (let i = 0; i < c.n; i++) out.push(c.w);
    return out.sort((a, b) => b - a);
};

// Which of two ways to build the same load is the better one to be told.
// Fewest plates first -- fastest to load, shortest to read -- and then the
// heaviest plates, because 80 kg on a 20 kg bar is 25 + 5 a side, not
// 15 + 15. Both are two plates; only one is how anybody loads a bar.
//
// Combos are built heaviest plate first, so comparing them position by
// position is the same as comparing the plates you would pick up in order.
const isBetterCombo = (cand, existing) => {
    if (cand.plates !== existing.plates) return cand.plates < existing.plates;
    const a = flattenCombo(cand.combo);
    const b = flattenCombo(existing.combo);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (Math.abs(a[i] - b[i]) > EPS) return a[i] > b[i];
    }
    return false;
};

const buildLoadMap = (plates, perSide) => {
    const mult = perSide ? 2 : 1;
    let map = new Map([[0, { load: 0, combo: [], plates: 0 }]]);

    for (const p of plates) {
        const next = new Map(map);
        for (const entry of map.values()) {
            for (let n = 1; n <= p.count; n++) {
                const load = entry.load + n * p.w * mult;
                const k = key(load);
                const cand = {
                    load,
                    combo: entry.combo.concat([{ w: p.w, n }]),
                    plates: entry.plates + n,
                };
                const existing = next.get(k);
                if (!existing || isBetterCombo(cand, existing)) next.set(k, cand);
            }
        }
        map = next;
        // A pathological inventory (dozens of odd plate sizes) is the user's to
        // fix, but it must never lock the JS thread mid-workout.
        if (map.size > 20000) break;
    }
    return map;
};

const ladderValues = (ladder) => {
    const min = ladder.min;
    const max = ladder.max;
    const step = ladder.step;
    const out = [];
    if (!(step > 0) || !(max >= min)) return out;
    // A ladder of thousands of rungs is a typo, not a rack.
    const rungs = Math.min(400, Math.floor((max - min) / step + EPS));
    for (let i = 0; i <= rungs; i++) out.push(min + i * step);
    return out;
};

// Every combination of the add-on magnets that can ride on a stack pin.
const addOnSums = (addOns) => {
    let sums = [0];
    for (const a of addOns) sums = sums.concat(sums.map((s) => s + a));
    return sums;
};

const sortUnique = (values) => {
    const seen = new Set();
    const out = [];
    for (const v of values) {
        if (!Number.isFinite(v) || v < 0) continue;
        const k = key(v);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(v);
    }
    return out.sort((a, b) => a - b);
};

/**
 * Resolve an exercise profile against the gym defaults into the concrete set
 * of weights it can produce.
 *
 * Returns null when there is no usable profile, which every caller reads as
 * "carry on rounding the way you always did".
 */
export const resolveEquipment = (cfg, gym) => {
    const parsed = parseEquipment(cfg);
    if (!parsed) return null;
    const g = gym || defaultGym(false);

    if (parsed.type === EQUIPMENT.BARBELL) {
        const gymBar = num(g.bar);
        const bar = parsed.bar != null ? parsed.bar : (gymBar == null ? 20 : gymBar);
        const plates = parsed.plates || plateList(g.plates) || [];
        if (plates.length === 0) return null;
        const loads = buildLoadMap(plates, parsed.perSide);
        const values = sortUnique(Array.from(loads.values(), (e) => bar + e.load));
        return { type: parsed.type, values, bar, perSide: parsed.perSide, loads, plates };
    }

    if (parsed.type === EQUIPMENT.DUMBBELL) {
        const ladder = parsed.ladder || g.ladder;
        if (!ladder) return null;
        const raw = sortUnique(ladderValues(ladder).concat(parsed.extra));
        if (raw.length === 0) return null;
        const values = parsed.pair ? raw.map((v) => v * 2) : raw;
        return { type: parsed.type, values, pair: parsed.pair, perDumbbell: raw };
    }

    if (!parsed.stack || parsed.stack.length === 0) return null;
    const adds = addOnSums(parsed.addOns);
    const values = sortUnique([].concat(...parsed.stack.map((s) => adds.map((a) => s + a))));
    return { type: parsed.type, values, stack: parsed.stack, addOns: parsed.addOns };
};

// Resolving a plate rack costs a fraction of a millisecond, but every set row
// on the Current page would otherwise pay it on every render. Keyed on the
// exact inputs, so a changed profile or a changed gym misses and recomputes.
const resolveCache = new Map();

export const resolveEquipmentCached = (cfg, gym) => {
    if (!cfg) return null;
    const k = (typeof cfg === 'string' ? cfg : JSON.stringify(cfg)) + '|' + JSON.stringify(gym || null);
    if (resolveCache.has(k)) return resolveCache.get(k);
    const resolved = resolveEquipment(cfg, gym);
    // Bounded: a user has hundreds of exercises, not thousands, and the
    // gym profile changes about once.
    if (resolveCache.size > 300) resolveCache.clear();
    resolveCache.set(k, resolved);
    return resolved;
};

// ── Snapping ────────────────────────────────────────────────────────────────

/** The achievable weight closest to `target`. Ties go to the lighter one. */
export const snapToGrid = (target, values) => {
    if (!values || values.length === 0) return target;
    let best = values[0];
    let bestGap = Math.abs(values[0] - target);
    for (let i = 1; i < values.length; i++) {
        const gap = Math.abs(values[i] - target);
        if (gap < bestGap - EPS) { best = values[i]; bestGap = gap; }
    }
    return best;
};

/**
 * The next achievable weight in `dir` from `current`, aiming for roughly a
 * `pct` change but never landing back where it started.
 *
 * Returns null when the equipment has nothing further in that direction -- the
 * plates have run out, or the stack is at its last pin. The caller falls back
 * to plain unit rounding rather than suggesting the same weight forever.
 */
export const stepOnGrid = (current, values, dir = 1, pct = 0.025) => {
    if (!values || values.length === 0) return null;
    const snapped = snapToGrid(current * (1 + dir * pct), values);
    if (dir > 0 ? snapped > current + EPS : snapped < current - EPS) return snapped;

    // The proportional step was smaller than one notch of this equipment, so
    // take exactly one notch.
    if (dir > 0) {
        for (let i = 0; i < values.length; i++) if (values[i] > current + EPS) return values[i];
        return null;
    }
    for (let i = values.length - 1; i >= 0; i--) if (values[i] < current - EPS) return values[i];
    return null;
};

// ── Plate maths ─────────────────────────────────────────────────────────────

/**
 * What to actually load on the bar for a target weight.
 *
 * `exact` is false when the plates cannot make the number the user typed, in
 * which case `total` is the closest they can make -- shown as such, because
 * silently rounding the display would have someone load 32.5 while the card
 * still read 34.
 */
export const platesForWeight = (target, resolved) => {
    if (!resolved || resolved.type !== EQUIPMENT.BARBELL || !Number.isFinite(target)) return null;
    const load = target - resolved.bar;
    if (load < -EPS) {
        return { belowBar: true, bar: resolved.bar, total: resolved.bar, combo: [], exact: false, perSide: resolved.perSide };
    }
    if (Math.abs(load) < EPS) {
        return { bar: resolved.bar, total: resolved.bar, combo: [], exact: true, perSide: resolved.perSide, barOnly: true };
    }

    const direct = resolved.loads.get(key(load));
    if (direct) {
        return { bar: resolved.bar, total: target, combo: direct.combo, exact: true, perSide: resolved.perSide };
    }

    let best = null;
    let bestGap = Infinity;
    for (const entry of resolved.loads.values()) {
        const gap = Math.abs(entry.load - load);
        if (gap < bestGap - EPS || (best && Math.abs(gap - bestGap) < EPS && isBetterCombo(entry, best))) {
            best = entry;
            bestGap = gap;
        }
    }
    if (!best) return null;
    return {
        bar: resolved.bar,
        total: resolved.bar + best.load,
        combo: best.combo,
        exact: false,
        perSide: resolved.perSide,
    };
};

// ── Descriptions ────────────────────────────────────────────────────────────

const trim = (n) => String(Math.round(n * 100) / 100);

/** One line for a settings row: enough to recognise, short enough to fit. */
export const describeEquipment = (cfg, gym, useImperial = false, toDisplay = (v) => v) => {
    const parsed = parseEquipment(cfg);
    if (!parsed) return 'Not set';
    const unit = useImperial ? 'lb' : 'kg';

    if (parsed.type === EQUIPMENT.BARBELL) {
        const gymBar = num(gym && gym.bar);
        const bar = parsed.bar != null ? parsed.bar : (gymBar == null ? 20 : gymBar);
        return `${trim(toDisplay(bar))} ${unit} bar`;
    }
    if (parsed.type === EQUIPMENT.DUMBBELL) {
        const ladder = parsed.ladder || (gym && gym.ladder);
        if (!ladder) return 'Dumbbells';
        return `${trim(toDisplay(ladder.min))}-${trim(toDisplay(ladder.max))} in ${trim(toDisplay(ladder.step))}s`;
    }
    const n = (parsed.stack && parsed.stack.length) || 0;
    return n ? `${n} pins` : 'Weight stack';
};

/**
 * Guess a type from an exercise's name.
 *
 * Only ever used to pre-select a control the user still has to save, so a
 * wrong guess costs one tap and a right one saves the whole interaction.
 * Never call this to decide behaviour.
 */
export const guessEquipmentType = (name) => {
    const n = String(name || '').toLowerCase();
    if (/dumbbell|\bdb\b/.test(n)) return EQUIPMENT.DUMBBELL;
    if (/machine|cable|pulldown|pull-down|pushdown|press-?down|pec deck|stack/.test(n)) return EQUIPMENT.STACK;
    if (/barbell|smith|deadlift|bench press|squat|\bez\b|hex bar|trap bar/.test(n)) return EQUIPMENT.BARBELL;
    return EQUIPMENT.NONE;
};
