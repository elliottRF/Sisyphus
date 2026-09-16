import { Dimensions } from "react-native";
const { height, width } = Dimensions.get("window");

// ─── Typography ──────────────────────────────────────────────────────────────
// Inter tracks San Francisco closely; weights map to iOS text styles.
export const FONTS = {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semiBold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
};

// iOS-derived type scale (sizes in pt). Use these instead of ad-hoc numbers.
export const TYPE = {
    largeTitle: 32,
    title: 24,
    title2: 20,
    headline: 17,
    body: 15,
    subhead: 14,
    footnote: 13,
    caption: 12,
    caption2: 11,
};

// ─── Layout tokens ───────────────────────────────────────────────────────────
export const SPACING = {
    xs: 4,
    s: 8,
    m: 12,
    l: 16,
    xl: 24,
    xxl: 32,
};

export const RADIUS = {
    s: 8,
    m: 12,
    l: 16,
    xl: 22,
    pill: 100,
};

// Soft, diffuse, low-opacity — shadows should be felt, not seen.
// boxShadow, not Android's `elevation`, and the difference is not cosmetic.
//
// An elevation shadow is drawn by the framework from the view's outline, and it
// does NOT take part in an ancestor's alpha unless that ancestor is composited
// offscreen -- which React Native does not do by default. So anything that
// fades a screen or a card in or out left every shadow underneath it at full
// strength while its contents went transparent, and on a light theme that reads
// as a hard grey box around each card. Tab reveals, card entrances, a pressed
// TouchableOpacity: all of them.
//
// boxShadow is part of the view's own drawing, so it fades with everything
// else. The values below are matched to what the elevation shadows rendered as
// -- measured against the old build, the difference at rest is a few levels of
// grey, slightly softer.
export const SHADOWS = {
    small: { boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.10)' },
    medium: { boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.14)' },
};

export const withAlpha = (color, opacity) => {
    if (typeof color !== 'string') return color;

    if (color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }
        if (hex.length !== 6) return color;

        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    return color;
};

// Composite a translucent overlay onto an opaque base and return the flat
// result. A fill painted with alpha is blended against whatever is behind it
// at draw time, which means it can be blended TWICE -- and a fill blended
// twice comes out lighter. Anything that has to survive an opacity animation
// unchanged should be painted flat instead, using this.
export const flattenOverlay = (overlay, base) => {
    const rgba = typeof overlay === 'string' && overlay.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
    if (!rgba) return overlay;
    const a = rgba[4] === undefined ? 1 : parseFloat(rgba[4]);

    let b = base;
    if (typeof b === 'string' && b.startsWith('#')) {
        let hex = b.slice(1);
        if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
        if (hex.length < 6) return overlay;
        b = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    } else {
        const m = typeof b === 'string' && b.match(
            /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return overlay;
        b = [1, 2, 3].map((i) => parseInt(m[i], 10));
    }

    const mix = (o, u) => Math.round(o * a + u * (1 - a));
    const out = [1, 2, 3].map((i, n) => mix(parseInt(rgba[i], 10), b[n]));
    return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export const SIZES = {
    height,
    width,
};

// --- THEME UTILS ---

const isLight = (color) => {
    if (typeof color !== 'string') return false; // Default to dark background (light status bar)

    let r, g, b;
    if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6 || hex.length === 8) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        }
    } else if (color.startsWith('rgba') || color.startsWith('rgb')) {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            r = parseInt(match[1]);
            g = parseInt(match[2]);
            b = parseInt(match[3]);
        }
    } else {
        return false; // Unknown color format
    }

    // YIQ brightness formula
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128;
};

// Same test, exported for components that must pick black/white text over a
// colour they derived themselves (e.g. a lightened primary) rather than over
// theme.primary, which is what theme.textAlternate is computed against.
export const isLightColor = isLight;


// ─── THEME DEFINITIONS ───────────────────────────────────────────────────────
// Two themes, both built strictly from the iOS system palette.
// `secondary` intentionally equals `primary`: existing [primary, secondary]
// gradients collapse to flat fills, which is the native look we want.

// iOS dark, elevated grouped style: charcoal canvas (not OLED black) so the
// UI keeps contrast under harsh gym lighting, with each layer stepped up.
const DEFAULT = {
    // Every derived value below is what buildCustomTheme() produces from
    // primary/background/surface/text, so the shipped default and a custom
    // theme built from the same four inputs render identically -- and so the
    // store screenshots and the app are the same thing.
    primary: "#5AA9FF",            // systemBlue, lifted for near-black
    primaryDark: "#4A8BD1",        // mix(primary, black, 0.18)
    secondary: "#5AA9FF",
    background: "#0B0E12",
    surface: "#141A21",
    surfaceElevated: "#21272E",    // mix(surface, text, 0.06)
    // Off pure white. White on near-black halates -- the faint glow that
    // makes text look very slightly out of focus -- and a dark theme is
    // mostly read at night, which is exactly when that shows.
    text: "#F2F5F8",
    textSecondary: "#919497",      // mix(text, background, 0.42) -- 6.3:1
    textTertiary: "#636669",       // mix(text, background, 0.62)
    // The accent is LIGHT by the YIQ test, so a filled button carries black
    // text, not white. White on #5AA9FF is 3.5:1 and fails the 4.5 floor the
    // custom-theme generator enforces; black is 8.6:1.
    textAlternate: "#000000",      // text on primary-filled controls
    border: "#33393F",             // mix(surface, text, 0.14)
    success: "#30D158",            // systemGreen (dark)
    danger: "#FF453A",             // systemRed (dark)
    error: "#FF453A",
    warning: "#FF9F0A",            // systemOrange (dark)
    info: "#64D2FF",               // systemCyan (dark)
    bodyFill: "#383D43",           // mix(surface, text, 0.16) -- unworked muscle
    chartFill: "rgba(90, 169, 255, 0.16)",
    statusBar: "light",
    overlaySubtle: "rgba(255,255,255,0.04)",
    overlayMedium: "rgba(255,255,255,0.06)",
    overlayBorder: "rgba(255,255,255,0.09)",
    overlayInput: "rgba(118,118,128,0.26)",   // systemFill-style input wells
    overlayInputFocused: "rgba(118,118,128,0.40)",
};

// iOS light, grouped style: grey canvas, white cards.
const LIGHT = {
    primary: "#007AFF",            // systemBlue (light)
    primaryDark: "#0064D2",
    secondary: "#007AFF",
    background: "#F2F2F7",         // systemGroupedBackground (light)
    surface: "#FFFFFF",            // secondarySystemGroupedBackground (light)
    surfaceElevated: "#F2F2F7",    // tertiarySystemGroupedBackground (light)
    // Not pure black. #000 on #FFF is 21:1, the highest contrast two colours
    // can have, and on a page that is mostly white -- a session's set list, the
    // exercise library -- it glares rather than reads. A near-black keeps the
    // text unmistakably black while taking the hard edge off; at 17:1 there is
    // no legibility being traded for it. Chosen to match the dark theme's own
    // surface colour, so the two themes are the same near-black inverted.
    text: "#1C1C1E",               // label, softened from #000000 (21:1 -> 17:1)
    textSecondary: "#8A8A8E",      // secondaryLabel flattened to hex
    textTertiary: "#C5C5C7",       // tertiaryLabel flattened to hex
    textAlternate: "#FFFFFF",
    border: "#E3E3E8",             // separator flattened to hex
    success: "#34C759",            // systemGreen (light)
    danger: "#FF3B30",             // systemRed (light)
    error: "#FF3B30",
    warning: "#FF9500",            // systemOrange (light)
    info: "#32ADE6",               // systemCyan (light)
    bodyFill: "#D1D1D6",
    chartFill: "rgba(0, 122, 255, 0.14)",
    statusBar: "dark",
    overlaySubtle: "rgba(60,60,67,0.03)",
    overlayMedium: "rgba(60,60,67,0.05)",
    overlayBorder: "rgba(60,60,67,0.08)",
    overlayInput: "rgba(118,118,128,0.12)",
    overlayInputFocused: "rgba(0,122,255,0.10)",
};

// The palette that shipped as DEFAULT until 1.5.11 -- a neutral charcoal canvas
// rather than the cooler near-black. Kept as a preset so the old look is one
// tap away instead of something to rebuild in the custom editor.
const CHARCOAL = {
    primary: "#0A84FF",            // systemBlue (dark)
    primaryDark: "#0974DE",
    secondary: "#0A84FF",
    background: "#1C1C1E",         // systemGroupedBackground (dark, elevated)
    surface: "#2C2C2E",            // secondarySystemGroupedBackground (elevated)
    surfaceElevated: "#3A3A3C",    // tertiarySystemGroupedBackground (elevated)
    text: "#F0F0F2",               // label
    textSecondary: "#A8A8AE",      // secondaryLabel, boosted for bright rooms
    textTertiary: "#7C7C82",       // tertiaryLabel, boosted for bright rooms
    textAlternate: "#FFFFFF",      // #0A84FF is dark by the YIQ test, so white
    border: "#434345",             // separator flattened to hex
    success: "#30D158",            // systemGreen (dark)
    danger: "#FF453A",             // systemRed (dark)
    error: "#FF453A",
    warning: "#FF9F0A",            // systemOrange (dark)
    info: "#64D2FF",               // systemCyan (dark)
    bodyFill: "#3A3A3C",           // unworked muscle fill
    chartFill: "rgba(10, 132, 255, 0.18)",
    statusBar: "light",
    overlaySubtle: "rgba(255,255,255,0.04)",
    overlayMedium: "rgba(255,255,255,0.06)",
    overlayBorder: "rgba(255,255,255,0.09)",
    overlayInput: "rgba(118,118,128,0.26)",   // systemFill-style input wells
    overlayInputFocused: "rgba(118,118,128,0.40)",
};

// Export the dictionary. Previously saved theme ids that no longer exist
// fall back to DEFAULT in ThemeContext (it checks `THEMES[storedThemeID]`).
export const THEMES = {
    DEFAULT,
    CHARCOAL,
    LIGHT,
};

export const isLightTheme = (theme) => {
    if (!theme) return false;
    return isLight(theme.background || theme.surface || '#000000');
};

export const getThemedShadow = (theme, size = 'medium') => {
    if (isLightTheme(theme)) {
        if (size === 'small') {
            return { boxShadow: '0px 4px 12px rgba(60, 60, 67, 0.06)' };
        }

        return { boxShadow: '0px 8px 20px rgba(60, 60, 67, 0.08)' };
    }

    return SHADOWS[size] || SHADOWS.medium;
};

// ─── Custom theme builder ─────────────────────────────────────────────────────
// A custom theme is generated from just four colours; everything else is
// derived so the result is always internally consistent. Crucially,
// `textAlternate` (the text drawn on solid-primary buttons/inputs) is forced
// to black or white based on the primary's brightness, so it stays legible.

const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));

const parseHex = (hex) => {
    if (typeof hex !== 'string') return null;
    let h = hex.trim().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const toHex = ({ r, g, b }) =>
    '#' + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('');

// Linear blend between two hex colours (t: 0 = c1, 1 = c2).
const mix = (c1, c2, t) => {
    const a = parseHex(c1);
    const b = parseHex(c2);
    if (!a || !b) return c1;
    return toHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
};

const hslToHex = (h, s, l) => {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return toHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
};

export const isValidHex = (hex) => parseHex(hex) !== null;

// What the custom-theme creator starts from: the current default, so "Create"
// opens on what the user is already looking at rather than a stale palette.
export const DEFAULT_CUSTOM_INPUT = {
    primary: '#5AA9FF',
    background: '#0B0E12',
    surface: '#141A21',
    text: '#F2F5F8',
};

export const buildCustomTheme = ({ primary, background, surface, text }) => {
    const lightBg = isLight(background);
    return {
        type: 'custom',
        primary,
        primaryDark: mix(primary, '#000000', 0.18),
        secondary: primary,
        background,
        surface,
        surfaceElevated: mix(surface, text, 0.06),
        text,
        textSecondary: mix(text, background, 0.42),
        textTertiary: mix(text, background, 0.62),
        // Legible text on solid-primary fills (buttons, inputs).
        textAlternate: isLight(primary) ? '#000000' : '#FFFFFF',
        border: mix(surface, text, 0.14),
        success: '#30D158',
        danger: '#FF453A',
        error: '#FF453A',
        warning: '#FF9F0A',
        info: '#64D2FF',
        bodyFill: mix(surface, text, 0.16),
        chartFill: withAlpha(primary, 0.16),
        statusBar: lightBg ? 'dark' : 'light',
        overlaySubtle: lightBg ? 'rgba(60,60,67,0.03)' : 'rgba(255,255,255,0.04)',
        overlayMedium: lightBg ? 'rgba(60,60,67,0.05)' : 'rgba(255,255,255,0.06)',
        overlayBorder: lightBg ? 'rgba(60,60,67,0.08)' : 'rgba(255,255,255,0.09)',
        overlayInput: lightBg ? 'rgba(118,118,128,0.12)' : 'rgba(118,118,128,0.26)',
        overlayInputFocused: lightBg ? 'rgba(118,118,128,0.20)' : 'rgba(118,118,128,0.40)',
    };
};

// ─── Random palettes ──────────────────────────────────────────────────────────
// Variety comes from varying the accent's SATURATION and LIGHTNESS as well as
// its hue, and from occasionally breaking the background away from the accent
// hue. (The old version used a single recipe — S≈70/75, L≈48/62 — rotated
// around the wheel, so every roll came out the same washed-out tone.)
//
// Perceived brightness differs wildly between hues at the same HSL lightness
// (yellow reads far lighter than blue), so rather than hand-tuning per hue, the
// accent's lightness is nudged until it actually clears a contrast ratio
// against its background. That lets deep and neon accents both be safe.

const relLuminance = (hex) => {
    const c = parseHex(hex);
    if (!c) return 0;
    const f = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};

const contrastRatio = (a, b) => {
    const la = relLuminance(a);
    const lb = relLuminance(b);
    return la > lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
};

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.round(rand(min, max));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Accent characters. Pastel is kept — it's a legitimate look — but it's now one
// option among several rather than the only outcome.
const ACCENT_FLAVOURS = {
    vivid: { dark: { s: [82, 96], l: [54, 66] }, light: { s: [80, 95], l: [40, 50] } },
    neon: { dark: { s: [95, 100], l: [58, 70] }, light: { s: [92, 100], l: [44, 54] } },
    deep: { dark: { s: [70, 92], l: [42, 54] }, light: { s: [72, 95], l: [26, 38] } },
    muted: { dark: { s: [26, 48], l: [52, 68] }, light: { s: [22, 45], l: [32, 44] } },
    pastel: { dark: { s: [42, 68], l: [70, 82] }, light: { s: [45, 70], l: [52, 64] } },
};

// Weighted so vivid/deep dominate and pastel is occasional.
const FLAVOUR_BAG = ['vivid', 'vivid', 'vivid', 'deep', 'deep', 'neon', 'muted', 'pastel'];

export const randomThemeInput = () => {
    const hue = randInt(0, 359);
    const dark = Math.random() > 0.35;
    const flavour = pick(FLAVOUR_BAG);
    const recipe = ACCENT_FLAVOURS[flavour][dark ? 'dark' : 'light'];
    const sat = randInt(recipe.s[0], recipe.s[1]);

    // How the chrome relates to the accent: usually tinted with it, sometimes
    // near-neutral so a vivid accent really pops, sometimes pulled to another
    // part of the wheel entirely.
    const harmony = pick(['match', 'match', 'match', 'neutral', 'offset', 'offset']);
    const bgHue = harmony === 'offset'
        ? (hue + pick([150, 180, 210, -40, 40]) + 360) % 360
        : hue;
    const bgSat = harmony === 'neutral' ? randInt(0, 5) : (dark ? randInt(8, 22) : randInt(6, 30));

    let background;
    let surface;
    let text;

    if (dark) {
        const bgL = rand(4, 12);
        background = hslToHex(bgHue, bgSat, bgL);
        surface = hslToHex(bgHue, Math.max(0, bgSat - 2), bgL + rand(5, 8));
        // Slightly hue-tinted whites read warmer than flat #FFF.
        text = Math.random() > 0.5 ? '#FFFFFF' : hslToHex(bgHue, randInt(4, 12), 97);
    } else {
        // Kept a touch off pure white so a white surface still reads as a card.
        const bgL = rand(92, 96);
        background = hslToHex(bgHue, bgSat, bgL);
        surface = Math.random() > 0.4 ? '#FFFFFF' : hslToHex(bgHue, Math.max(0, bgSat - 3), Math.min(100, bgL + 3.5));
        text = hslToHex(bgHue, randInt(8, 28), randInt(8, 16));
    }

    // Walk the accent's lightness until it satisfies both jobs it has to do:
    // reading as accent text on the background, AND carrying a legible
    // black/white label when used as a solid button fill. Mid-lightness accents
    // fail the second (neither black nor white works on them), so the same
    // nudge fixes both — dark themes brighten, light themes darken.
    const MIN_BG_CONTRAST = 3.4;
    const MIN_LABEL_CONTRAST = 4.5;
    const labelOn = (hex) => (isLight(hex) ? '#000000' : '#FFFFFF');
    const step = dark ? 3 : -3;
    let lightness = rand(recipe.l[0], recipe.l[1]);
    let primary = hslToHex(hue, sat, lightness);
    for (let i = 0; i < 30; i++) {
        const bgOk = contrastRatio(primary, background) >= MIN_BG_CONTRAST;
        const labelOk = contrastRatio(labelOn(primary), primary) >= MIN_LABEL_CONTRAST;
        if (bgOk && labelOk) break;
        const next = Math.max(6, Math.min(94, lightness + step));
        if (next === lightness) break;
        lightness = next;
        primary = hslToHex(hue, sat, lightness);
    }

    return { primary, background, surface, text };
};

// Deprecated: Backwards compatibility for now, will be removed
export const COLORS = DEFAULT;
