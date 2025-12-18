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

export const SIZES = {
    height,
    width,
};

// --- THEME DEFINITIONS ---


const MONO = {
    primary: "#ffffff",
    primaryDark: "#b2bec3",
    secondary: "#ffffff",
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
};

const CHERRY_BLOSSOM = {
    primary: "#ff85a1",      // Soft Pink
    primaryDark: "#f75c81",
    secondary: "#ff85a1",    // Soft Pink
    background: "#fff5f7",   // Very light pink tint
    surface: "#ffffff",
    text: "#4a2c33",         // Dark berry for readability
    textSecondary: "#a38089",
    border: "#f2d5da",
    success: "#4ade80",
    danger: "#f87171",
    warning: "#fbbf24",
    info: "#60a5fa",
    bodyFill: "#e0e0e0",
};

const CYBER_PINK = {
    primary: "#ff007f",      // Neon Magenta
    primaryDark: "#c70063",
    secondary: "#ff007f",    // Neon Magenta
    background: "#0d0108",   // Near-black with pink tint
    surface: "#1a0212",      // Deep wine/black
    text: "#ffe0f0",
    textSecondary: "#b37795",
    border: "#3d142b",
    success: "#00f5d4",
    danger: "#ff4d6d",
    warning: "#fee440",
    info: "#00bbf9",
    bodyFill: "#333333",
};

const TITANIUM = {
    primary: "#0A84FF",      // Apple San Francisco Blue
    primaryDark: "#0066CC",
    secondary: "#0A84FF",    // iOS System Gray
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
} : TITANIUM; // Fallback for non-android


// Export the dictionary
export const THEMES = {
    ...(Platform.OS === 'android' ? { SYSTEM } : {}),
    TITANIUM,
    MONO,
    ARCTIC,
    NOTHING,
    TERMINAL,
    CYBER_PINK,
    CHERRY_BLOSSOM,
    SCHEMATIC,
    CALIPER,
};

// Deprecated: Backwards compatibility for now, will be removed
export const COLORS = TITANIUM;

