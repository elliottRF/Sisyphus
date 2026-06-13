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
export const SHADOWS = {
    small: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.10,
        shadowRadius: 8,
        elevation: 1,
    },
    medium: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14,
        shadowRadius: 16,
        elevation: 3,
    },
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
            return {
                shadowColor: '#3C3C43',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.06,
                shadowRadius: 12,
                elevation: 2,
            };
        }

        return {
            shadowColor: '#3C3C43',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.08,
            shadowRadius: 20,
            elevation: 4,
        };
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

// A coherent random palette (background/surface tinted by the accent hue).
export const randomThemeInput = () => {
    const hue = Math.floor(Math.random() * 360);
    const dark = Math.random() > 0.4;
    return dark
        ? { primary: hslToHex(hue, 75, 62), background: hslToHex(hue, 14, 8), surface: hslToHex(hue, 12, 14), text: '#FFFFFF' }
        : { primary: hslToHex(hue, 70, 48), background: hslToHex(hue, 30, 97), surface: '#FFFFFF', text: hslToHex(hue, 25, 12) };
};

// Deprecated: Backwards compatibility for now, will be removed
export const COLORS = DEFAULT;
