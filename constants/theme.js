import { Dimensions, Platform, PlatformColor } from "react-native";
const { height, width } = Dimensions.get("window");

// Base Fonts (Shared across themes usually, but can be customized)
export const FONTS = {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semiBold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
};

export const SHADOWS = {
    small: {
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 2,
    },
    medium: {
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 5.84,
        elevation: 5,
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
        return false; // PlatformColor or unknown
    }

    // YIQ brightness formula
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128;
};


// --- THEME DEFINITIONS ---
const DEFAULT = {
    primary: "#0A84FF",      // Apple San Francisco Blue
    primaryDark: "#007AFF",  // Slightly boosted for visibility
    secondary: "#0A84FF",
    background: "#151517",   // Lifted from near-black to deep charcoal to reduce glare
    surface: "#242426",      // Noticeably lighter than background for card definition
    text: "#FFFFFF",
    textSecondary: "#A1A1A6",// Boosted from #8E8E93 for better legibility in bright light
    textAlternate: "#FFFFFF",
    border: "#3A3A3C",       // Made more distinct so UI sections are visible
    success: "#30D158",      // Slightly more vibrant iOS Green
    danger: "#FF453A",
    warning: "#FF9F0A",
    info: "#64D2FF",
    bodyFill: "#3A3A3C",     // Matches borders for a cohesive look
    statusBar: "light",
    // Increased opacity for overlays to ensure they don't disappear under glare
    overlaySubtle: "rgba(255,255,255,0.02)",
    overlayMedium: "rgba(255,255,255,0.03)",
    overlayBorder: "rgba(255,255,255,0.05)",
    overlayInput: "rgba(0,0,0,0.2)",
    overlayInputFocused: "rgba(0,0,0,0.4)",
};


const NOIR = {
    primary: "#ffffff",
    primaryDark: "#b2bec3",
    secondary: "#ffffff",
    background: "#0d0d0d",
    surface: "#1a1a1a",
    text: "#ffffff",
    textSecondary: "#999999",
    textAlternate: "#1a1a1a",
    border: "#2a2a2a",
    success: "#27ae60",
    danger: "#e74c3c",
    warning: "#f1c40f",
    info: "#3498db",
    bodyFill: "#333333",
    statusBar: isLight("#0d0d0d") ? "dark" : "light",
    // Adaptive overlays (white for dark themes)
    overlaySubtle: "rgba(255,255,255,0.02)",
    overlayMedium: "rgba(255,255,255,0.03)",
    overlayBorder: "rgba(255,255,255,0.05)",
    overlayInput: "rgba(0,0,0,0.2)",
    overlayInputFocused: "rgba(0,0,0,0.4)",
};

const ARCTIC = {
    primary: "#74f9ff",      // Ice blue
    primaryDark: "#3dd5e1",
    secondary: "#74f9ff",
    background: "#0a141a",
    surface: "#102027",
    text: "#f8feff",
    textSecondary: "#a7cbd9",
    textAlternate: "#000000ff",
    border: "#1f3a44",
    success: "#2ecc71",
    danger: "#ff7675",
    warning: "#ffeaa7",
    info: "#54a0ff",
    bodyFill: "#333333",
    statusBar: isLight("#0a141a") ? "dark" : "light",
    // Adaptive overlays (white for dark themes)
    overlaySubtle: "rgba(255,255,255,0.02)",
    overlayMedium: "rgba(255,255,255,0.03)",
    overlayBorder: "rgba(255,255,255,0.05)",
    overlayInput: "rgba(0,0,0,0.2)",
    overlayInputFocused: "rgba(0,0,0,0.4)",
};

const NOTHING = {
    primary: "#ff2a2a",      // Nothing red
    primaryDark: "#b71c1c",
    secondary: "#ff2a2a",    // Stark white
    background: "#000000",   // Pure black
    surface: "#0b0b0b",      // Near-black
    text: "#ffffff",
    textSecondary: "#8e8e8e",
    textAlternate: "#ffffffff",
    border: "#1a1a1a",
    success: "#9eff00",      // Techy lime
    danger: "#ff2a2a",
    warning: "#ffcc00",
    info: "#ffffff",
    bodyFill: "#333333",
    statusBar: isLight("#000000") ? "dark" : "light",
    // Adaptive overlays (white for dark themes)
    overlaySubtle: "rgba(255,255,255,0.02)",
    overlayMedium: "rgba(255,255,255,0.03)",
    overlayBorder: "rgba(255,255,255,0.05)",
    overlayInput: "rgba(0,0,0,0.2)",
    overlayInputFocused: "rgba(0,0,0,0.4)",
};

const TERMINAL = {
    primary: "#00ff9c",      // Phosphor green
    primaryDark: "#00c97a",
    secondary: "#00ff9c",
    background: "#050807",
    surface: "#0b1210",
    text: "#eafff6",
    textSecondary: "#6fbfa2",
    textAlternate: "#000000ff",
    border: "#13261e",
    success: "#00ff9c",
    danger: "#ff4d4d",
    warning: "#ffd166",
    info: "#4ddcff",
    bodyFill: "#333333",
    statusBar: isLight("#050807") ? "dark" : "light",
    // Adaptive overlays (white for dark themes)
    overlaySubtle: "rgba(255,255,255,0.02)",
    overlayMedium: "rgba(255,255,255,0.03)",
    overlayBorder: "rgba(255,255,255,0.05)",
    overlayInput: "rgba(0,0,0,0.2)",
    overlayInputFocused: "rgba(0,0,0,0.4)",
};

const SCHEMATIC = {
    primary: "#ffd600",      // PCB yellow
    primaryDark: "#c7a600",
    secondary: "#ffd600",    // PCB yellow
    background: "#0a0f14",
    surface: "#121820",
    text: "#e6edf3",
    textSecondary: "#8fa3b8",
    textAlternate: "#1a1a1a",
    border: "#1f2a36",
    success: "#00ff87",
    danger: "#ff5c5c",
    warning: "#ffb300",
    info: "#00e5ff",
    bodyFill: "#333333",
    statusBar: isLight("#0a0f14") ? "dark" : "light",
    // Adaptive overlays (white for dark themes)
    overlaySubtle: "rgba(255,255,255,0.02)",
    overlayMedium: "rgba(255,255,255,0.03)",
    overlayBorder: "rgba(255,255,255,0.05)",
    overlayInput: "rgba(0,0,0,0.2)",
    overlayInputFocused: "rgba(0,0,0,0.4)",
};

const CALIPER = {
    primary: "#2563eb",      // Precision blue
    primaryDark: "#1e40af",
    secondary: "#2563eb",    // Precision blue
    background: "#0f172a",
    surface: "#111827",
    text: "#f9fafb",
    textSecondary: "#9ca3af",
    textAlternate: "#1a1a1a",
    border: "#1f2933",
    success: "#22c55e",
    danger: "#ef4444",
    warning: "#eab308",
    info: "#38bdf8",
    bodyFill: "#333333",
    statusBar: isLight("#0f172a") ? "dark" : "light",
    // Adaptive overlays (white for dark themes)
    overlaySubtle: "rgba(255,255,255,0.02)",
    overlayMedium: "rgba(255,255,255,0.03)",
    overlayBorder: "rgba(255,255,255,0.05)",
    overlayInput: "rgba(0,0,0,0.2)",
    overlayInputFocused: "rgba(0,0,0,0.4)",
};

const BLOSSOM = {
    // Brand Colors
    primary: "#FF85A1",           // Soft Pink (Main Accent)
    primaryDark: "#E06A86",       // Deeper Pink (Active States/Buttons)
    secondary: "#ff85a1",         // Soft Periwinkle (Complementary for Data/Charts)

    // Neutrals & Surfaces
    background: "#FFF1F4",        // Slightly richer pink wash for stronger structure
    surface: "#FFFFFF",           // Pure White (Cards & Modals)
    border: "#EBCFD7",            // Stronger blush border

    // Typography
    text: "#2D1A1E",              // Deep Berry (High Contrast for Readability)
    textSecondary: "#7C5E66",     // Darker muted rose-grey for utility text
    textAlternate: "#ffffffff",
    // Feedback & Semantic
    success: "#7CD9A3",           // Sage Green (Softened for the theme)
    danger: "#F28D8D",            // Coral Red
    warning: "#F7C97E",           // Muted Amber
    info: "#89CFF0",              // Baby Blue

    // Heatmap & Charting
    bodyFill: "#ddced1ff",          // Base color for unworked muscles
    chartFill: "rgba(255, 133, 161, 0.25)", // Transparent Primary for Radar fill

    statusBar: isLight("#FFF5F7") ? "dark" : "light",
    // Adaptive Overlays
    overlaySubtle: "rgba(45, 26, 30, 0.028)",
    overlayMedium: "rgba(45, 26, 30, 0.05)",
    overlayBorder: "rgba(45, 26, 30, 0.08)",
    overlayInput: "rgba(45, 26, 30, 0.045)",
    overlayInputFocused: "rgba(255, 133, 161, 0.12)",
};

const BLACK_PINK = {
    primary: "#ff007f",      // Neon Magenta
    primaryDark: "#c70063",
    secondary: "#ff007f",    // Neon Magenta
    background: "#13010dff",   // Near-black with pink tint
    surface: "#1a0212",      // Deep wine/black
    text: "#ffe0f0",
    textSecondary: "#b37795",
    border: "#3d142b",
    success: "#00f5d4",
    danger: "#ff4d6d",
    warning: "#fee440",
    info: "#00bbf9",
    bodyFill: "#333333",
    statusBar: isLight("#13010dff") ? "dark" : "light",
    // Adaptive overlays (white for dark themes)
    overlaySubtle: "rgba(255,255,255,0.02)",
    overlayMedium: "rgba(255,255,255,0.03)",
    overlayBorder: "rgba(255,255,255,0.05)",
    overlayInput: "rgba(0,0,0,0.2)",
    overlayInputFocused: "rgba(0,0,0,0.4)",
};

const DEFAULT_DARK = {
    primary: "#0A84FF",      // Apple San Francisco Blue
    primaryDark: "#0066CC",
    secondary: "#0A84FF",    // iOS System Gray
    background: "#080808ff",
    surface: "#121214",      // iOS Secondary System Background
    text: "#FFFFFF",         // Primary Label
    textSecondary: "#8E8E93",// Secondary Label
    textAlternate: "#FFFFFF",
    border: "#2C2C2E",       // Thin, subtle separator
    success: "#32D74B",      // iOS System Green
    danger: "#FF453A",       // iOS System Red
    warning: "#FF9F0A",      // iOS System Orange
    info: "#64D2FF",         // iOS System Cyan
    bodyFill: "#333333",
    statusBar: isLight("#080808ff") ? "dark" : "light",
    // Adaptive overlays (white for dark themes)
    overlaySubtle: "rgba(255,255,255,0.02)",
    overlayMedium: "rgba(255,255,255,0.03)",
    overlayBorder: "rgba(255,255,255,0.05)",
    overlayInput: "rgba(0,0,0,0.2)",
    overlayInputFocused: "rgba(0,0,0,0.4)",
};


const THRIVE = {
    primary: "#1bffcd",      // Apple San Francisco Blue
    primaryDark: "#2E7F78",
    secondary: "#8143a3",    // iOS System Gray
    background: "#000000",   // Pure Black (OLED optimized) - FIXED from #080808ff
    surface: "#121214",      // iOS Secondary System Background
    text: "#FFFFFF",         // Primary Label
    textSecondary: "#8E8E93",// Secondary Label
    textAlternate: "#ffffffff",
    border: "#2C2C2E",       // Thin, subtle separator
    success: "#32D74B",      // iOS System Green
    danger: "#FF453A",       // iOS System Red
    warning: "#FF9F0A",      // iOS System Orange
    info: "#64D2FF",         // iOS System Cyan
    bodyFill: "#333333",
    statusBar: isLight("#000000") ? "dark" : "light",
    // Adaptive overlays (white for dark themes)
    overlaySubtle: "rgba(255,255,255,0.02)",
    overlayMedium: "rgba(255,255,255,0.03)",
    overlayBorder: "rgba(255,255,255,0.05)",
    overlayInput: "rgba(0,0,0,0.2)",
    overlayInputFocused: "rgba(0,0,0,0.4)",
};
const LIGHT = {
    // Brand Colors
    primary: "#3B82F6",           // Vibrant Blue (Trustworthy & Standard)
    primaryDark: "#2563EB",       // Richer Blue (Hover/Active States)
    secondary: "#6366F1",         // Indigo (Complementary for Charts)

    // Neutrals & Surfaces
    background: "#F3F7FC",        // Cleaner cool background for elevated white cards
    surface: "#FFFFFF",           // Pure White
    border: "#D7E1EC",            // Stronger border so bright cards still separate

    // Typography
    text: "#162033",              // Deep Navy with slightly softer contrast
    textSecondary: "#5D6B80",     // Darker secondary text for better readability
    textAlternate: "#FFFFFF",
    // Feedback & Semantic
    success: "#10B981",           // Emerald Green
    danger: "#EF4444",            // Standard Red
    warning: "#F59E0B",           // Amber
    info: "#0EA5E9",              // Sky Blue

    // Heatmap & Charting
    bodyFill: "#b4b9c0ff",          // Neutral Slate for unworked areas
    chartFill: "rgba(59, 130, 246, 0.15)", // Transparent Blue for Radar

    statusBar: isLight("#F8FAFC") ? "dark" : "light",
    // Adaptive Overlays
    overlaySubtle: "rgba(15, 23, 42, 0.028)",
    overlayMedium: "rgba(15, 23, 42, 0.05)",
    overlayBorder: "rgba(15, 23, 42, 0.08)",
    overlayInput: "rgba(15, 23, 42, 0.045)",
    overlayInputFocused: "rgba(59, 130, 246, 0.12)",
};

const SYSTEM = Platform.OS === 'android' ? {
    type: 'dynamic', // Flag to indicate special handling needed (no gradients etc)
    primary: PlatformColor('@android:color/system_accent1_200'), // Lighter accent for dark mode
    secondary: PlatformColor('@android:color/system_accent1_200'),
    background: PlatformColor('@android:color/system_neutral1_900'), // Dark background
    surface: PlatformColor('@android:color/system_neutral1_800'), // Slightly lighter surface
    text: PlatformColor('@android:color/system_neutral1_50'),    // Light text
    textSecondary: PlatformColor('@android:color/system_neutral1_300'),
    border: PlatformColor('@android:color/system_neutral1_700'),
    success: PlatformColor('@android:color/system_accent2_400'), // Fallback roughly
    danger: '#ef4444', // Keep standard dangers/warnings for safety visibility
    warning: '#f59e0b',
    info: '#3b82f6',
    bodyFill: '#494949ff',
    statusBar: 'light', // Native dark background
    // Adaptive overlays (white for dark themes)
    overlaySubtle: "rgba(255,255,255,0.02)",
    overlayMedium: "rgba(255,255,255,0.03)",
    overlayBorder: "rgba(255,255,255,0.05)",
    overlayInput: "rgba(0,0,0,0.2)",
    overlayInputFocused: "rgba(0,0,0,0.4)",
} : DEFAULT; // Fallback for non-android


// Export the dictionary
export const THEMES = {
    DEFAULT,
    DEFAULT_DARK,
    LIGHT,
    NOIR,
    ARCTIC,
    NOTHING,
    TERMINAL,
    BLACK_PINK,
    BLOSSOM,
    SCHEMATIC,
    CALIPER,
    THRIVE
};

export const isLightTheme = (theme) => {
    if (!theme) return false;
    return isLight(theme.background || theme.surface || '#000000');
};

export const getThemedShadow = (theme, size = 'medium') => {
    if (theme?.type === 'dynamic') {
        return SHADOWS[size] || SHADOWS.medium;
    }

    if (isLightTheme(theme)) {
        if (size === 'small') {
            return {
                shadowColor: '#7C8FAA',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.12,
                shadowRadius: 18,
                elevation: 4,
            };
        }

        return {
            shadowColor: '#7C8FAA',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.16,
            shadowRadius: 24,
            elevation: 8,
        };
    }

    return SHADOWS[size] || SHADOWS.medium;
};

// Deprecated: Backwards compatibility for now, will be removed
export const COLORS = DEFAULT;

