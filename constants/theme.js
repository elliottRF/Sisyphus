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
    primary: "#0A84FF",            // systemBlue (dark)
    primaryDark: "#0974DE",
    secondary: "#0A84FF",
    background: "#1C1C1E",         // systemGroupedBackground (dark, elevated)
    surface: "#2C2C2E",            // secondarySystemGroupedBackground (elevated)
    surfaceElevated: "#3A3A3C",    // tertiarySystemGroupedBackground (elevated)
    text: "#FFFFFF",               // label
    textSecondary: "#AEAEB4",      // secondaryLabel, boosted for bright rooms
    textTertiary: "#7C7C82",       // tertiaryLabel, boosted for bright rooms
    textAlternate: "#FFFFFF",      // text on primary-filled controls
    border: "#3A3A3C",             // separator flattened to hex
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

// iOS light, grouped style: grey canvas, white cards.
const LIGHT = {
    primary: "#007AFF",            // systemBlue (light)
    primaryDark: "#0064D2",
    secondary: "#007AFF",
    background: "#F2F2F7",         // systemGroupedBackground (light)
    surface: "#FFFFFF",            // secondarySystemGroupedBackground (light)
    surfaceElevated: "#F2F2F7",    // tertiarySystemGroupedBackground (light)
    text: "#000000",               // label
    // Apple's own secondaryLabel is #8A8A8E, which is 3.44:1 on a white card
    // -- under the 4.5 that normal text needs, and this carries the set/lift
    // column headers, the workout stat line and the muscle split. The dark
    // theme had already been boosted for the same reason; this is light's turn.
    textSecondary: "#6C6C70",      // secondaryLabel, darkened: 3.44 -> 5.23:1
    textTertiary: "#C5C5C7",       // tertiaryLabel flattened to hex
    textAlternate: "#FFFFFF",
    border: "#E3E3E8",             // separator flattened to hex
    // The system greens, oranges and reds are meant as FILLS on iOS, not as
    // small text on white, and used as text they were the least legible things
    // on the screen: systemGreen is 2.2:1, systemOrange 2.2:1 -- and those are
    // the readiness percentages, the numbers the card exists to communicate.
    // Darkened until they pass. They stay recognisably the same hues, and at
    // the 10-16% alpha the chips and bars use them the difference is slight.
    success: "#1E8E3E",            // green,  2.22 -> 4.21:1 on white
    danger: "#D70015",             // red,    3.55 -> 5.38:1
    error: "#D70015",
    // Orange is the awkward one: dark enough to pass and it reads BROWN, which
    // breaks the green-amber-red ramp the readiness tiles depend on. This is
    // the lightest value that still clears 4.5, so it stays the most vivid
    // orange available rather than the most legible brown.
    warning: "#BF5700",            // orange, 2.20 -> 4.59:1
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

// Export the dictionary. Previously saved theme ids that no longer exist
// fall back to DEFAULT in ThemeContext (it checks `THEMES[storedThemeID]`).
export const THEMES = {
    DEFAULT,
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

export const DEFAULT_CUSTOM_INPUT = {
    primary: '#0A84FF',
    background: '#1C1C1E',
    surface: '#2C2C2E',
    text: '#FFFFFF',
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
        // These followed the overlays' lead and now branch on the background
        // too. They were fixed at the dark variants, so a custom theme built on
        // a light background got systemGreen at about 1.9:1 -- less legible
        // than the built-in light theme it sits beside. Same values as LIGHT
        // and DEFAULT, chosen the same way.
        success: lightBg ? '#1E8E3E' : '#30D158',
        danger: lightBg ? '#D70015' : '#FF453A',
        error: lightBg ? '#D70015' : '#FF453A',
        warning: lightBg ? '#BF5700' : '#FF9F0A',
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
