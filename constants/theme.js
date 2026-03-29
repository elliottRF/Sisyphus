import { Dimensions, Platform, PlatformColor, Appearance } from "react-native";
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


const NOIR = {
    primary: "#ffffff",
    primaryDark: "#b2bec3",
    secondary: "#ffffff7e",
    background: "#0d0d0d",
    surface: "#1a1a1a",
    text: "#ffffff",
    textSecondary: "#999999",
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
    background: "#FFF5F7",        // Very Light Pink Tint (Lifts white cards)
    surface: "#FFFFFF",           // Pure White (Cards & Modals)
    border: "#F7DCE1",            // Soft Pinkish Border

    // Typography
    text: "#2D1A1E",              // Deep Berry (High Contrast for Readability)
    textSecondary: "#8A6A72",     // Muted Rose-Grey (Subtle info)

    // Feedback & Semantic
    success: "#7CD9A3",           // Sage Green (Softened for the theme)
    danger: "#F28D8D",            // Coral Red
    warning: "#F7C97E",           // Muted Amber
    info: "#89CFF0",              // Baby Blue

    // Heatmap & Charting
    bodyFill: "#F2E2E5",          // Base color for unworked muscles
    chartFill: "rgba(255, 133, 161, 0.25)", // Transparent Primary for Radar fill

    statusBar: isLight("#FFF5F7") ? "dark" : "light",
    // Adaptive Overlays
    overlaySubtle: "rgba(45, 26, 30, 0.02)",
    overlayMedium: "rgba(45, 26, 30, 0.04)",
    overlayBorder: "rgba(45, 26, 30, 0.06)",
    overlayInput: "rgba(45, 26, 30, 0.03)",
    overlayInputFocused: "rgba(255, 133, 161, 0.1)",
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

const DEFAULT = {
    primary: "#0A84FF",      // Apple San Francisco Blue
    primaryDark: "#0066CC",
    secondary: "#0A84FF",    // iOS System Gray
    background: "#080808ff",
    surface: "#121214",      // iOS Secondary System Background
    text: "#FFFFFF",         // Primary Label
    textSecondary: "#8E8E93",// Secondary Label
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
    secondary: "#5a2676",    // iOS System Gray
    background: "#000000",   // Pure Black (OLED optimized) - FIXED from #080808ff
    surface: "#121214",      // iOS Secondary System Background
    text: "#FFFFFF",         // Primary Label
    textSecondary: "#8E8E93",// Secondary Label
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
    background: "#F8FAFC",        // Cool Slate Grey (Modern App Background)
    surface: "#FFFFFF",           // Pure White
    border: "#E2E8F0",            // Subtle Slate Border

    // Typography
    text: "#0F172A",              // Deep Navy/Slate (Maximum Contrast)
    textSecondary: "#64748B",     // Medium Slate (Muted Info)

    // Feedback & Semantic
    success: "#10B981",           // Emerald Green
    danger: "#EF4444",            // Standard Red
    warning: "#F59E0B",           // Amber
    info: "#0EA5E9",              // Sky Blue

    // Heatmap & Charting
    bodyFill: "#E2E8F0",          // Neutral Slate for unworked areas
    chartFill: "rgba(59, 130, 246, 0.15)", // Transparent Blue for Radar

    statusBar: isLight("#F8FAFC") ? "dark" : "light",
    // Adaptive Overlays
    overlaySubtle: "rgba(15, 23, 42, 0.02)",
    overlayMedium: "rgba(15, 23, 42, 0.04)",
    overlayBorder: "rgba(15, 23, 42, 0.06)",
    overlayInput: "rgba(15, 23, 42, 0.03)",
    overlayInputFocused: "rgba(59, 130, 246, 0.1)",
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
    bodyFill: '#333333',
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
    ...(Platform.OS === 'android' ? { SYSTEM } : {}),
    DEFAULT,
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

// Deprecated: Backwards compatibility for now, will be removed
// Default to LIGHT if system is light mode, otherwise DEFAULT (dark)
export const COLORS = Appearance.getColorScheme() === 'light' ? LIGHT : DEFAULT;

