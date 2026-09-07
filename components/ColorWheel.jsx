import React, { useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import Svg, { Path, Circle, Defs, RadialGradient, LinearGradient, Stop, Rect } from 'react-native-svg';
import { FONTS, RADIUS, SPACING, TYPE } from '../constants/theme';

// An HSV colour wheel: hue around, saturation from the centre out, with a
// brightness bar underneath.
//
// Drawn with react-native-svg, which the app already uses. SVG has no conic
// gradient, so the hue ring is 72 five-degree wedges of solid colour -- at this
// size the seams are invisible, and the paths are static so only the marker
// moves while dragging. A white radial gradient over the top provides the
// saturation falloff and a black overlay applies the brightness, which keeps
// the wheel showing the colour actually being picked rather than a fixed
// full-brightness one.

const WEDGES = 72;
const BAR_HEIGHT = 28;
const THUMB = 22;

// ── Colour conversion ──────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const hsvToRgb = (h, s, v) => {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const seg = Math.floor(h / 60) % 6;
    const [r1, g1, b1] = [
        [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
    ][seg];
    return [
        Math.round((r1 + m) * 255),
        Math.round((g1 + m) * 255),
        Math.round((b1 + m) * 255),
    ];
};

export const hsvToHex = (h, s, v) => {
    const [r, g, b] = hsvToRgb(h, s, v);
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
};

export const hexToHsv = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return null;
    const int = parseInt(m[1], 16);
    const r = ((int >> 16) & 255) / 255;
    const g = ((int >> 8) & 255) / 255;
    const b = (int & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h, s: max === 0 ? 0 : d / max, v: max };
};

// ── Wheel geometry ─────────────────────────────────────────────────────────
const wedgePath = (cx, cy, r, startDeg, endDeg) => {
    const a0 = (startDeg * Math.PI) / 180;
    const a1 = (endDeg * Math.PI) / 180;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
};

const ColorWheel = ({ theme, color, onChange, size = 220 }) => {
    const styles = useMemo(() => getStyles(theme), [theme]);
    const R = size / 2;

    const [hsv, setHsv] = useState(() => hexToHsv(color) || { h: 210, s: 1, v: 1 });

    // Follow the value from outside (hex typed into the field, Randomise), but
    // not our own emissions -- comparing against what we last sent keeps a drag
    // from fighting the round trip through the parent.
    const lastEmitted = useRef(null);
    useEffect(() => {
        if (!color || color === lastEmitted.current) return;
        const next = hexToHsv(color);
        if (next) setHsv(next);
    }, [color]);

    const emit = (next) => {
        setHsv(next);
        const hex = hsvToHex(next.h, next.s, next.v);
        lastEmitted.current = hex;
        onChange?.(hex);
    };

    // Latest state for the gesture callbacks, which are created once.
    const hsvRef = useRef(hsv);
    hsvRef.current = hsv;

    // Both gestures track from where the finger LANDED plus the accumulated
    // dx/dy, rather than reading locationX/locationY on every move. Those are
    // only meaningful while the touch is inside the view: once a finger leaves
    // it -- past the end of the bar, or a few pixels below it -- Android
    // reports them against whatever view is under the finger, which made the
    // slider thumb jump around. Start-plus-delta is unaffected by any of that,
    // so overshooting simply clamps and vertical drift is ignored outright.
    const startRef = useRef({ x: 0, y: 0 });

    const applyWheel = (x, y) => {
        const dx = x - R;
        const dy = y - R;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (deg < 0) deg += 360;
        emit({ ...hsvRef.current, h: deg, s: clamp(dist / R, 0, 1) });
    };

    const wheelPan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            // The wheel sits in a ScrollView; claiming the gesture stops the
            // sheet scrolling out from under a drag.
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (e) => {
                startRef.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
                applyWheel(startRef.current.x, startRef.current.y);
            },
            onPanResponderMove: (e, g) => {
                applyWheel(startRef.current.x + g.dx, startRef.current.y + g.dy);
            },
        })
    ).current;

    const applyBar = (x) => {
        emit({ ...hsvRef.current, v: clamp(x / size, 0, 1) });
    };
    const barPan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (e) => {
                startRef.current = { x: e.nativeEvent.locationX, y: 0 };
                applyBar(startRef.current.x);
            },
            // Only dx: sliding a finger off the bar vertically must not move it.
            onPanResponderMove: (e, g) => applyBar(startRef.current.x + g.dx),
        })
    ).current;

    const wedges = useMemo(() => {
        const step = 360 / WEDGES;
        return Array.from({ length: WEDGES }, (_, i) => ({
            d: wedgePath(R, R, R, i * step - 0.5, (i + 1) * step + 0.5),
            fill: hsvToHex(i * step, 1, 1),
        }));
    }, [R]);

    const markerX = R + Math.cos((hsv.h * Math.PI) / 180) * hsv.s * R;
    const markerY = R + Math.sin((hsv.h * Math.PI) / 180) * hsv.s * R;
    const current = hsvToHex(hsv.h, hsv.s, hsv.v);
    const fullValue = hsvToHex(hsv.h, hsv.s, 1);

    return (
        <View style={styles.wrap}>
            <View style={{ width: size, height: size }} {...wheelPan.panHandlers}>
                <Svg width={size} height={size}>
                    <Defs>
                        <RadialGradient id="sat" cx="50%" cy="50%" r="50%">
                            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
                            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                        </RadialGradient>
                    </Defs>
                    {wedges.map((w, i) => (
                        <Path key={i} d={w.d} fill={w.fill} />
                    ))}
                    <Circle cx={R} cy={R} r={R} fill="url(#sat)" />
                    {/* Brightness, so the wheel shows the colour being picked
                        rather than a permanently bright one. A hair wider than
                        the wheel: at the same radius its anti-aliased edge does
                        not quite cover the wedges' own, which left a thread of
                        colour around the outside at full black. The overshoot
                        is clipped by the canvas. */}
                    <Circle cx={R} cy={R} r={R + 1} fill="#000000" opacity={1 - hsv.v} />
                    <Circle cx={markerX} cy={markerY} r={11} fill={current} stroke="#FFFFFF" strokeWidth={3} />
                    <Circle cx={markerX} cy={markerY} r={13.5} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
                </Svg>
            </View>

            {/* Explicit pixel dimensions, not percentages: react-native-svg
                does not resolve a percentage width here and the bar rendered
                with no width at all. */}
            <View
                style={[styles.bar, { width: size, height: BAR_HEIGHT }]}
                {...barPan.panHandlers}
            >
                <Svg width={size} height={BAR_HEIGHT}>
                    <Defs>
                        <LinearGradient id="val" x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor="#000000" />
                            <Stop offset="1" stopColor={fullValue} />
                        </LinearGradient>
                    </Defs>
                    <Rect x={0} y={0} width={size} height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} fill="url(#val)" />
                </Svg>
                <View
                    pointerEvents="none"
                    style={[styles.barThumb, { left: clamp(hsv.v * size, THUMB / 2, size - THUMB / 2) }]}
                />
            </View>

            <View style={styles.readout}>
                <View style={[styles.readoutSwatch, { backgroundColor: current }]} />
                <Text style={styles.readoutText}>{current}</Text>
            </View>
        </View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    wrap: { alignItems: 'center', gap: SPACING.m },
    bar: {
        borderRadius: BAR_HEIGHT / 2,
        justifyContent: 'center',
    },
    barThumb: {
        position: 'absolute',
        width: THUMB,
        height: THUMB,
        marginLeft: -THUMB / 2,
        borderRadius: THUMB / 2,
        borderWidth: 3,
        borderColor: '#FFFFFF',
    },
    readout: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.s,
    },
    readoutSwatch: {
        width: 22,
        height: 22,
        borderRadius: RADIUS.s,
    },
    readoutText: {
        fontSize: TYPE.subhead,
        fontFamily: FONTS.semiBold,
        color: theme.text,
        letterSpacing: 0.5,
    },
});

export default ColorWheel;
