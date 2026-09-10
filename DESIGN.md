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
- **Press feedback on a card is a spring to `scale: 0.98` plus the touchable's
  own opacity dim** (`speed: 20, bounciness: 4`, `activeOpacity: 0.8`) -- never
  a tint. `Pressable`'s `pressed` style cannot animate: it switches between
  frames, so a tint appears and vanishes as a block. Copy the values from
  `components/exerciseHistory.jsx` rather than approximating them; two press
  animations that are nearly the same read worse than one that is.

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

**Tab switches are instant, and navigating between tabs animates nothing.**
A `Reveal` component that animated a screen's blocks on arrival was built and
then removed entirely; the record is worth keeping, because each step failed
for a different reason:

1. Replaying it on every switch meant hiding a tab's blocks on blur so the
   next visit could fade them in. Any interruption -- most reliably
   backgrounding the app and returning -- left a tab showing nothing but its
   chrome until it was switched away from and back. **Never leave a screen's
   content at zero opacity waiting on an event to bring it back.**
2. Narrowed to one deliberate trigger, fading the whole Current page up from
   zero showed a frame of empty background, which read as a flash; and the
   thin, light elements in it (the SET/PREVIOUS/KG/REPS header, + ADD SET)
   flickered rather than glided, because they cross the visibility threshold
   at a different point from the solid fills around them. **Never fade a
   whole screen up from zero, and never cross-fade a large area containing
   fine light text.**
3. Replaced by a per-card rise, which looked right -- but the trigger was a
   global one-shot token with a time window, not scoped to a destination, so
   returning to Home quickly after it fired made Home animate too. A
   navigation-triggered animation must be owned by the screen that plays it.

What remains is simpler and has no failure mode: each screen animates its own
content on ITS OWN first mount and never in response to navigation.

**A lazily mounted tab paints nothing for a frame or two after it is switched
to** -- an empty content area above the tab bar, which reads as a black flash
before the content pops in. The gap is native layout and draw and cannot be
animated away; what fixes the impression is everything arriving together, so
**every tab fades its WHOLE content in once on mount** (280ms), and no tab
animates only part of itself. Animating a list but not its header, or cards but
not the card above them, is worse than animating nothing: the un-animated parts
snap into an empty page while the rest fades.

Two things that cost real time here:

- **`entering` does not run on a screen's outermost view.** react-native-screens
  adds that view natively and Reanimated never sees it mount. Put the animation
  on an inner wrapper inside the root container, not on the root itself. The
  symptom is a mount animation that silently does nothing, at any duration.
- Anything that animates per row must be **time-boxed from mount**, never gated
  on index alone: these lists are virtualised and RN mounts the remaining cells
  at idle and again while scrolling, so an index gate has rows animating under
  the user's thumb long after the screen has settled. The 14px rise is reserved
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
- **A suggestion must be a weight the user's gym can actually make.**
  Rounding to 2.5 kg is right for an Olympic bar and wrong for a 7 kg pin
  stack, a 9 kg EZ bar or a rack that changes step halfway up. Exercises
  carry an equipment profile (`utils/equipment.js`) and suggestions snap to
  it. Two rules hold there and are easy to lose:
  - **An unconfigured exercise behaves exactly as it did before.** Every
    existing install has no profiles; any drift moves real users' numbers
    with no action from them.
  - **A profile that does not describe the lift is ignored, not obeyed.**
    120 kg on a stack profile that stops at 70 is a mis-tagged exercise, and
    letting it govern the suggestion turns one wrong tap into stuck numbers.
  When the equipment has nothing further in the direction wanted -- the last
  pin, the heaviest dumbbell -- the suggestion adds a rep rather than
  printing a weight that does not exist.
- **Plate breakdowns pick the fewest plates, then the heaviest.** 80 kg on a
  20 kg bar is 25 + 5 a side, not 15 + 15. Both are two plates; only one is
  how anybody loads a bar.
- **Equipment is editable on built-in exercises**, whose name and type are
  locked. It describes the machine in front of the user, not the exercise.
  For the same reason saving it must not run the exercise-definition update:
  that sets `userCustomised`, which freezes the exercise's muscle groups
  against every future catalogue correction.
- **Warm-ups (`setType = 'W'`) are excluded from PRs on the WRITE side too.**
  Every stat query already filtered them; the three places that set the flags
  did not, so a trophy could land on a set the user marked as a warm-up -- a row
  the stats page then ignores -- and the running historical best took the
  warm-up's value with it, blocking later genuine PRs. In the live finish path
  the guard has to cover assignment as well as the maximum: a warm-up can
  coincidentally equal the session's best weight and reps.
- **Bump `DB_SETUP_VERSION` on any schema change.** A database stamped with
  the current version skips every column/table/index check at launch. Add a
  column without bumping it and existing installs never get the column.
- **Metro's blockList must be anchored to the project root.** It is matched
  against absolute paths, so the unanchored `.claude/worktrees` rule also
  matched every file of a worktree that was itself the project root: Metro
  blocked the whole app and died on `Unable to resolve module
  ./node_modules/expo-router/entry`, which reads like a broken install.
  Native builds from a worktree are still a fight -- ninja reports
  `manifest 'build.ninja' still dirty after 100 tries` on the longer paths --
  so build and test from the main checkout.
- **PapaParse is not used to READ a CSV any more** (). Strong
  quotes every field, which turns off Papa's fast path; on a release build its
  quote loop took **184 seconds** on a 1.06 MB export against 21 seconds for
  every database write in the same import. The replacement parses the same file
  in 77ms and is checked field-for-field against Papa's output on the real
  export plus the edges it does not contain.  still writes.
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
- **Track a drag by where it started plus the gesture's dx/dy, never by
  reading `locationX`/`locationY` on every move.** Those are only meaningful
  while the touch is inside the view; once a finger leaves it -- past the end
  of a slider, or a few pixels below it -- Android reports them against
  whatever view is under the finger, and the control jumps around. Start-plus-
  delta clamps cleanly at the ends and ignores drift on the other axis.
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
