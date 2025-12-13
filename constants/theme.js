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
    ...(Platform.OS === 'android' ? { SYSTEM } : {})
};

// Deprecated: Backwards compatibility for now, will be removed
export const COLORS = MIDNIGHT;
