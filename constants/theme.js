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

const MIDNIGHT = {
    primary: "#2DC4B6",      // Teal
    primaryDark: "#1F8A80",  // Darker Teal
    secondary: "#A29BFE",    // Light Purple
    background: "#121212",   // Very Dark Grey
    surface: "#1E1E1E",      // Dark Grey
    text: "#FFFFFF",
    textSecondary: "#AAAAAA",
    border: "#333333",
    success: "#00b894",
    danger: "#d63031",
    warning: "#fdcb6e",
    info: "#0984e3",
};

const OCEAN = {
    primary: "#00cec9",      // Cyan
    primaryDark: "#008B87",  // Darker Cyan
    secondary: "#74b9ff",    // Sky Blue
    background: "#0c1e29",   // Deep Navy
    surface: "#132d3d",      // Navy
    text: "#e8f7ff",         // Off-white cyan
    textSecondary: "#8ab6d1",
    border: "#204a63",
    success: "#2ecc71",
    danger: "#ff7675",
    warning: "#ffeaa7",
    info: "#0984e3",
};

const SUNSET = {
    primary: "#ff7675",      // Salmon
    primaryDark: "#B84B4A",  // Darker Salmon
    secondary: "#fab1a0",    // Peach
    background: "#2d1313",   // Deep warm brown
    surface: "#421c1c",      // Warm brown
    text: "#fff5f5",
    textSecondary: "#dcbaba",
    border: "#633030",
    success: "#55efc4",
    danger: "#d63031",
    warning: "#fdcb6e",
    info: "#74b9ff",
};

const FOREST = {
    primary: "#55efc4",      // Mint
    primaryDark: "#3AA888",  // Darker Mint
    secondary: "#00b894",    // Green
    background: "#0F1A15",   // Deep Green
    surface: "#182921",      // Forest Green
    text: "#f0fff4",
    textSecondary: "#88bca0",
    border: "#294537",
    success: "#00cec9",
    danger: "#ff7675",
    warning: "#ffeaa7",
    info: "#74b9ff",
};
const SOLAR = {
    primary: "#f9ca24",      // Yellow
    primaryDark: "#cfa10d",
    secondary: "#e17055",    // Orange
    background: "#1b1a14",   // Dark sand
    surface: "#2a291f",
    text: "#fffdf0",
    textSecondary: "#cfc8a3",
    border: "#3a382a",
    success: "#6ab04c",
    danger: "#eb4d4b",
    warning: "#f0932b",
    info: "#22a6b3",
};

const NEBULA = {
    primary: "#6c5ce7",      // Violet
    primaryDark: "#4834d4",
    secondary: "#fd79a8",    // Pink
    background: "#120b2b",   // Space purple
    surface: "#1c1440",
    text: "#f5f3ff",
    textSecondary: "#b8b2e6",
    border: "#2e2666",
    success: "#00cec9",
    danger: "#ff6b6b",
    warning: "#ffeaa7",
    info: "#74b9ff",
};

const MONO = {
    primary: "#ffffff",
    primaryDark: "#b2bec3",
    secondary: "#636e72",
    background: "#0d0d0d",
    surface: "#1a1a1a",
    text: "#ffffff",
    textSecondary: "#999999",
    border: "#2a2a2a",
    success: "#27ae60",
    danger: "#e74c3c",
    warning: "#f1c40f",
    info: "#3498db",
};

const DESERT = {
    primary: "#e1b382",      // Sand
    primaryDark: "#b08968",
    secondary: "#c97c5d",    // Clay
    background: "#24170f",   // Dark earth
    surface: "#362317",
    text: "#fff7ed",
    textSecondary: "#d6bfa8",
    border: "#4a3322",
    success: "#7bed9f",
    danger: "#ff6b6b",
    warning: "#ffa502",
    info: "#70a1ff",
};

const ARCTIC = {
    primary: "#74f9ff",      // Ice blue
    primaryDark: "#3dd5e1",
    secondary: "#dfe6e9",
    background: "#0a141a",
    surface: "#102027",
    text: "#f8feff",
    textSecondary: "#a7cbd9",
    border: "#1f3a44",
    success: "#2ecc71",
    danger: "#ff7675",
    warning: "#ffeaa7",
    info: "#54a0ff",
};

const AMOLED = {
    primary: "#00e5ff",      // Neon cyan
    primaryDark: "#00a8b5",
    secondary: "#9b5cff",    // Neon purple
    background: "#000000",   // True black
    surface: "#000000",      // True black
    text: "#ffffff",
    textSecondary: "#9aa0a6",
    border: "#121212",
    success: "#00e676",
    danger: "#ff5252",
    warning: "#ffd740",
    info: "#40c4ff",
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
};
const NOTHING_LIGHT = {
    primary: "#ff2a2a",
    primaryDark: "#c91f1f",
    secondary: "#000000",
    background: "#ffffff",
    surface: "#f4f4f4",
    text: "#000000",
    textSecondary: "#5c5c5c",
    border: "#e0e0e0",
    success: "#6dff00",
    danger: "#ff2a2a",
    warning: "#ffb000",
    info: "#000000",
};

const TERMINAL = {
    primary: "#00ff9c",      // Phosphor green
    primaryDark: "#00c97a",
    secondary: "#7cffc4",
    background: "#050807",
    surface: "#0b1210",
    text: "#eafff6",
    textSecondary: "#6fbfa2",
    border: "#13261e",
    success: "#00ff9c",
    danger: "#ff4d4d",
    warning: "#ffd166",
    info: "#4ddcff",
};

const SCHEMATIC = {
    primary: "#ffd600",      // PCB yellow
    primaryDark: "#c7a600",
    secondary: "#00e5ff",    // Cyan traces
    background: "#0a0f14",
    surface: "#121820",
    text: "#e6edf3",
    textSecondary: "#8fa3b8",
    border: "#1f2a36",
    success: "#00ff87",
    danger: "#ff5c5c",
    warning: "#ffb300",
    info: "#00e5ff",
};

const PAPER = {
    primary: "#111111",
    primaryDark: "#000000",
    secondary: "#666666",
    background: "#fafafa",   // Off-white
    surface: "#ffffff",
    text: "#111111",
    textSecondary: "#6f6f6f",
    border: "#dddddd",
    success: "#2ecc71",
    danger: "#e74c3c",
    warning: "#f1c40f",
    info: "#3498db",
};

const CALIPER = {
    primary: "#2563eb",      // Precision blue
    primaryDark: "#1e40af",
    secondary: "#9ca3af",    // Machined gray
    background: "#0f172a",
    surface: "#111827",
    text: "#f9fafb",
    textSecondary: "#9ca3af",
    border: "#1f2933",
    success: "#22c55e",
    danger: "#ef4444",
    warning: "#eab308",
    info: "#38bdf8",
};
// Android System Theme (Material You)
const SYSTEM = Platform.OS === 'android' ? {
    type: 'dynamic', // Flag to indicate special handling needed (no gradients etc)
    primary: PlatformColor('@android:color/system_accent1_200'), // Lighter accent for dark mode
    secondary: PlatformColor('@android:color/system_accent2_200'),
    background: PlatformColor('@android:color/system_neutral1_900'), // Dark background
    surface: PlatformColor('@android:color/system_neutral1_800'), // Slightly lighter surface
    text: PlatformColor('@android:color/system_neutral1_50'),    // Light text
    textSecondary: PlatformColor('@android:color/system_neutral1_300'),
    border: PlatformColor('@android:color/system_neutral1_700'),
    success: PlatformColor('@android:color/system_accent2_400'), // Fallback roughly
    danger: '#ef4444', // Keep standard dangers/warnings for safety visibility
    warning: '#f59e0b',
    info: '#3b82f6',
} : MIDNIGHT; // Fallback for non-android

// Export the dictionary
export const THEMES = {
    MIDNIGHT,
    OCEAN,
    SUNSET,
    FOREST,
    SOLAR,
    NEBULA,
    MONO,
    DESERT,
    ARCTIC,
    AMOLED,
    NOTHING,
    NOTHING_LIGHT,
    TERMINAL,
    SCHEMATIC,
    PAPER,
    CALIPER,
    ...(Platform.OS === 'android' ? { SYSTEM } : {})
};

// Deprecated: Backwards compatibility for now, will be removed
export const COLORS = MIDNIGHT;
