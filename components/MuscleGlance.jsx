import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Body from 'react-native-body-highlighter';

import { slugRecoveryPercent } from '../utils/recovery';
import { withAlpha } from '../constants/theme';

// A pair of small figures showing what a template trains and how recovered it
// is — front and back, the muscles it hits filled, everything else left bare.
//
// Two things at once, which is the point: the SHAPE tells you what the session
// is without reading a word (a leg day and a push day are unmistakable at 50dp),
// and the COLOUR tells you whether to do it today. It replaced a list of
// exercise names truncated to "Cable Machine Che…", which took four lines to say
// less.
//
// Both sides always, rather than picking the livelier one. Choosing needs a
// slug-to-side table that would have to be kept in step with the body library,
// and a card that sometimes shows a back and sometimes a front is harder to
// scan down a grid than a pair that never moves.

// The body library's own natural width, which `scale` is relative to.
const BODY_NATURAL_WIDTH = 163;
// Below ~60% recovered the app treats a muscle as fatigued, and under 80% as
// still recovering — the same thresholds as the Home tab's map, so a muscle is
// never a different colour on the two screens.
const FATIGUED_BELOW = 60;
const RECOVERING_BELOW = 80;

// How present the untrained body is. The library draws every striation, and at
// 50dp that detail is noise rather than anatomy, so the ghost is kept faint
// enough to read as one silhouette instead of a bundle of little shapes.
const GHOST = 0.09;

// Every part the body library draws, so the untrained ones can be themed rather
// than left to its own default. Same list the Home tab's map is built from.
const ALL_SLUGS = [
    'chest', 'quadriceps', 'triceps', 'biceps', 'hamstring',
    'upper-back', 'lower-back', 'deltoids', 'gluteal', 'forearm',
    'trapezius', 'calves', 'abs', 'adductors', 'obliques',
    'tibialis', 'abductors', 'neck', 'hands', 'feet', 'knees', 'ankles',
];

const MuscleGlance = ({
    slugs,
    muscleScores,
    theme,
    gender,
    width = 56,
    gap = 6,
    style,
}) => {
    // EVERY muscle goes in, not just the trained ones. Leaving the rest out and
    // colouring them with the library's `defaultFill` prop looks like it should
    // work and does not — on the light theme the untrained body still came back
    // the library's near-black instead of the theme's grey. Giving them their
    // own intensity puts them through `colors`, which is the path the Home
    // tab's map already uses, so they are themed the same way.
    const data = useMemo(() => {
        const trained = new Set(slugs || []);
        return ALL_SLUGS.map((slug) => {
            if (!trained.has(slug)) return { slug, intensity: 4 };
            const percent = muscleScores ? slugRecoveryPercent(muscleScores, slug) : 100;
            if (percent <= FATIGUED_BELOW) return { slug, intensity: 3 };
            if (percent < RECOVERING_BELOW) return { slug, intensity: 2 };
            return { slug, intensity: 1 };
        });
    }, [slugs, muscleScores]);

    // colors[intensity - 1]: ready, recovering, fatigued, untrained. A ready
    // muscle is drawn in the accent at full strength and slides toward the
    // warning colour as it tires, so a session that is not worth doing today
    // looks wrong before you have read the number.
    //
    // The untrained body is kept BARELY there. The Home tab's bodyFill is a
    // solid mid-grey, which is right at the size Home draws it and wrong here:
    // at 50dp every striation the library draws turns into lumpy noise and the
    // card reads as an anatomy chart. Dropped to a ghost, the figure is a
    // silhouette and the worked muscles are the only thing with any colour in
    // them, which is the whole point of putting it on the card.
    const colors = useMemo(() => [
        theme.primary,
        theme.warning,
        theme.danger,
        withAlpha(theme.text, GHOST),
    ], [theme]);

    // The female body is drawn slightly smaller by the library; matching the
    // Home tab's correction keeps the two figures the same size on the card.
    const scale = (width / BODY_NATURAL_WIDTH) * (gender === 'female' ? 0.86 : 1);

    return (
        <View style={[styles.row, { gap }, style]} pointerEvents="none">
            {['front', 'back'].map((side) => (
                <Body
                    key={side}
                    data={data}
                    gender={gender}
                    side={side}
                    scale={scale}
                    // The head, hands and feet are not in the slug list, so
                    // they fall to the library's own default; matching them to
                    // the ghost keeps the figure one piece. The outline matches
                    // too -- a contrasting one at this size is just noise.
                    defaultFill={withAlpha(theme.text, GHOST)}
                    border={withAlpha(theme.text, GHOST)}
                    colors={colors}
                    width={width}
                />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default React.memo(MuscleGlance);
