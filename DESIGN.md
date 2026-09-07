# Sisyphus — Design Reference

How this app is meant to look and behave. Written down because the rules were
previously only in conversation, which made every design change a negotiation
from scratch.

`constants/theme.js` is the source of truth for values. This file explains the
intent behind them, and the rules that aren't expressible as tokens.

---

## Intent

**Polished and intentional.** The shorthand used throughout has been
"Apple-esque", but that means considered, not literally imitative — creative
liberty is welcome.

**Plain minimalism reads as boring.** A screen that is merely clean has failed.
Every screen should have a point of view: a computed insight headline, a
deliberate use of colour, an editorial touch like a date eyebrow or a data point
in the section label. Whitespace and restraint are the baseline, not the idea.

**Compactness beats airiness when they conflict.** This is a gym app used
between sets, one-handed, often in a hurry. The Home screen in particular must
fit all its data with no scrolling — tight, at a glance.

---

## Tokens

Never write ad-hoc numbers for these. Import from `constants/theme.js`.

| Token | Use |
|---|---|
| `TYPE` | Type scale, iOS-derived. `largeTitle: 32` down to `caption2: 11`. |
| `SPACING` | `xs 4` · `s 8` · `m 12` · `l 16` · `xl 24` · `xxl 32`. |
| `RADIUS` | `s 8` · `m 12` · `l 16` · `xl 22` · `pill 100`. |
| `FONTS` | Inter, mapped to iOS weights. Tracks San Francisco closely. |
| `SHADOWS` | Soft and diffuse. Shadows should be felt, not seen. |

Helpers: `withAlpha`, `isLightTheme`, `getThemedShadow`, `isLightColor`.

---

## Screen anatomy

The standard header, reused everywhere:

```
EYEBROW WITH A DATA POINT          ← 12pt, uppercase, letterSpacing 1.2,
591 WORKOUTS LOGGED                  semiBold, theme.textSecondary
Large Title                        ← 32pt bold, letterSpacing -0.6
```

The eyebrow should carry information, not just label the screen. "591 WORKOUTS
LOGGED" earns its line; "HISTORY" above a title reading "History" does not.

Header icon buttons are quiet 34px circles filled `theme.overlayInput` — never
bordered, never tinted with the accent unless they represent state.

In-card section labels: 12pt semibold uppercase, `theme.textSecondary`.

---

## Cards and surfaces

- **Borderless.** Separation comes from surface colour in dark, and a soft
  shadow in light (`getThemedShadow(theme, 'small')`, applied *only* when
  `isLightTheme(theme)`).
- **Radius 16** for cards, **12** for tiles and inputs.
- **No dashed borders.** Anywhere.
- **No icons inside section titles.**
- **Whitespace instead of divider lines.** Where a separator is unavoidable use
  `StyleSheet.hairlineWidth` with `theme.border`.
- **Inside a surface-coloured sheet, cards are `theme.overlayInput` tiles**, not
  surface-on-surface with a border to make them visible.

## Colour

- **`secondary === primary` on purpose.** Existing `[primary, secondary]`
  LinearGradients collapse to flat, native-looking fills. Don't "fix" this.
- **Status colours are for accents only** — bars, percentages, dots, pills.
  Tiles and containers stay neutral (`theme.overlayInput`). A screen tinted
  end-to-end with a status colour reads as an error state.
- Readiness mapping: red `theme.danger` = fatigued, orange = recovering,
  green = ready.
- **Text on filled controls uses `theme.textAlternate`**, which is computed
  black or white from the primary's brightness. Never hardcode `#FFF` on a
  themed fill — custom themes will break it.
- **No OLED-black backgrounds.** Dark theme uses the elevated charcoal ladder
  (`#1C1C1E` / `#2C2C2E` / `#3A3A3C`) with boosted secondary text. The app is
  used in harshly lit gyms where true black is unreadable.
- Up/down is not always good/bad. Bodyweight trends are neutral — use a
  `theme.overlayInput` pill tinted primary, never red/green.

---

## Motion and loading

The user is highly sensitive to load jank, especially mid-workout when the JS
thread is busy. These are not preferences; they are the difference between the
app feeling premium and feeling cheap.

1. **Reserve space for async content.** Give lines a `minHeight` and always
   render them, with `' '` if empty. Never let a card resize when data lands.
2. **Seed the first paint from cache, synchronously**, in `useState`/`useMemo`
   initialisers. See `utils/exerciseSnapshots.js`, `getCachedExercises()`,
   `getCachedWorkoutHistory()`.
3. **Cross-fade swaps** via a display-state plus an animated opacity, rather
   than swapping content in place.
4. **Loading placeholders must occupy the exact height of the loaded state.**
5. **Refresh silently in the background.** Never flip to a loading state while
   correct data is already on screen. Subscribe to `WORKOUT_COMPLETED` /
   `WORKOUT_DATA_IMPORTED` and refresh ahead of focus, rather than refreshing
   on focus and flashing stale data.

**When something is added to or removed from a list, animate its real layout
height** (`components/Expandable.jsx`), never a layout transition on its
neighbours. Height carries everything below it -- the rest of the card, the
cards under it, the page footer -- in lockstep. A `LinearTransition` animates a
frame after the change has already landed, so the Current page's Add Exercise /
Finish Workout buttons either jumped or trailed a frame behind.

A static correct value beats an animated one. Don't animate a number that was
never stale.

**Tab switches are instant.** A staggered fade on every switch was tried and
reverted: hiding a tab's blocks on blur so the next visit could fade them in
meant any interruption -- most reliably backgrounding the app and returning --
left a tab showing nothing but its chrome until it was switched away from and
back. **Never leave a screen's content at zero opacity waiting on an event to
bring it back.** `components/Reveal.jsx` blocks start visible and only fade
when `armTabReveal()` is called immediately before navigating; the one caller
is Home's workout-in-progress banner, where arriving at the live workout should
feel like opening it rather than like changing tabs. The 14px rise is reserved
for content that is genuinely new (exercise cards landing).

---

## Hard-won rules

Each of these cost a real bug. Don't undo them.

- **Never `router.replace` or `push` a nested tab route to "go back"** from a
  pushed stack screen — pop it (`router.canGoBack() ? router.back() : …`).
  Replacing a root route with a tab route remounts the whole `(tabs)` navigator
  and they pile up. `router.navigate` is safe: it reuses the existing route.
- **Any screen-level transparent `<Modal>` must be force-closed on blur.** A
  context menu left mounted renders above everything app-wide and silently
  swallows touches on whatever screen you navigate to next.
- **`LayoutAnimation` does not animate row add/remove in a virtualised
  SectionList.** Use the ghost-row pattern in `history.jsx`: keep the list,
  flag the removed id, let that card collapse and fade, then commit the new
  list in `onExitDone`.
- **Never key features off workout-name matching.** Session names are
  unreliable.
- **Tabs mount lazily.** Anything Home or the tab bar needs at first paint
  (the in-progress workout flag, the timer) must be seeded in `ThemeContext`
  from stored state, never left for the Train tab to set on mount -- it isn't
  mounted until visited.
- **Bump `DB_SETUP_VERSION` on any schema change.** A database stamped with
  the current version skips every column/table/index check at launch. Add a
  column without bumping it and existing installs never get the column.
- **Measure cold start on a release build**, with `[boot]` markers in logcat
  (`adb logcat -v epoch | grep '\[boot\]'`). Baseline on a 640-session DB:
  splash hides ~1.0s on the emulator, ~75% of it native before JS runs.
- **Backgrounding the app drops any Reanimated animation that is pending or
  in flight**, and the view comes back at whatever value it had. Anything
  that animates opacity from 0 must snap to its resting value on an AppState
  change (see `components/Reveal.jsx`); otherwise "tap a tab, switch to the
  music app, come back" leaves a blank screen until the next tab switch.
- **`useAnimatedStyle` must return the same set of keys every time.** Dropping
  a key does not hand the property back to layout; Reanimated restores the
  value it had before the animation. A wrapper that animated `height` and then
  stopped returning it snapped back to 0 and hid its content.
- **A view capped to zero height also caps the space its content is measured
  in.** Anything that consults available height (a multiline `TextInput`)
  measures 0 in there and can never report the height it needs to grow to.
  Measure such content out of flow -- see `Expandable`'s grow mode.
- **Pass a stable `styles` object to any `React.memo`'d child.** An unmemoised
  `getStyles(theme)` gives it a new identity every render and the memo never
  holds. Memoise wherever the object crosses a memo boundary.

---

## Screen status

**Conformed:** Home, ReadinessCard, PRGraphCard, MuscleRadarChart,
BodyweightGraphCard, TabBar, History, Exercises, Current (chrome), Settings,
exerciseEditable, exercise detail page, workout summary, muscle detail sheet,
template editor, FilteredExerciseList, the calendar (`components/AppCalendar.jsx`
-- use it for every month view), bottom sheets (24 top radius, handle
`theme.overlayInputFocused` 36 wide), EditWorkout (shares Current's chrome).

**Audited 2026-09-06 on the owner's data, no change needed:** onboarding,
RestTimer (header pill), CustomAlert.

---

## Deliberately reverted — do not re-add

The session view (`components/WorkoutSessionView.jsx`) keeps its summary strip
and muscle-split line, and nothing else. Per-exercise two-month-best deltas,
best-set row highlighting, circular header buttons and borderless cards were all
tried here and explicitly rejected. This screen is intentionally inconsistent
with the rest; leave it alone.
