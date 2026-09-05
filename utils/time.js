// Cardio set duration helpers.
//
// The database stores cardio time as whole `seconds`. In a live workout the set
// keeps it in `minutes`, which may be fractional (e.g. 12.5 === 12:30) so no
// precision is lost round-tripping through the m:ss field. These helpers convert
// between that storage and the "m:ss" the user sees/edits.

// Whole seconds → "mm:ss", or "hh:mm:ss" once it's an hour or more.
export const secondsToClock = (totalSeconds) => {
    const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const hrs = Math.floor(s / 3600);
    const min = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (hrs > 0) {
        return `${String(hrs).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

// (Fractional) minutes → "mm:ss". Returns '' when unset so the field shows its
// placeholder rather than "00:00".
export const minutesToClock = (minutes) => {
    if (minutes === null || minutes === undefined || minutes === '') return '';
    const n = parseFloat(minutes);
    if (isNaN(n)) return '';
    return secondsToClock(n * 60);
};

// Positional display of the digits typed so far, WITHOUT normalizing. Digits map
// right-to-left: last two = seconds, next two = minutes, the rest = hours — each
// slot shown verbatim (even 60–99), so "99999" reads "09:99:99" and "560" reads
// "05:60" while editing. The value is repaired to a valid time on blur. '' empty.
export const clockDigitsToDisplay = (text) => {
    const digits = String(text ?? '').replace(/\D/g, '').slice(0, 7);
    if (digits.length === 0) return '';
    const sec = digits.slice(-2).padStart(2, '0');
    const min = digits.slice(-4, -2).padStart(2, '0');
    const hrs = digits.slice(0, -4);
    if (hrs) return `${hrs.padStart(2, '0')}:${min}:${sec}`;
    return `${min}:${sec}`;
};

// Digit-fill parse of the time field → (fractional) minutes for storage, or null
// when empty. Right-to-left: last two digits seconds, next two minutes, the rest
// hours — so "12345" is 1:23:45 and "99999" normalizes from 9:99:99.
export const clockDigitsToMinutes = (text) => {
    const digits = String(text ?? '').replace(/\D/g, '').slice(0, 7);
    if (digits.length === 0) return null;
    const sec = parseInt(digits.slice(-2), 10) || 0;
    const min = parseInt(digits.slice(-4, -2), 10) || 0;
    const hrs = parseInt(digits.slice(0, -4), 10) || 0;
    return (hrs * 3600 + min * 60 + sec) / 60;
};

// ─── Calendar days vs. instants ─────────────────────────────────────────
// A calendar day the user picked is not an instant, and the two must not be
// mixed. toISOString() reports the UTC day, which during BST is still yesterday
// between midnight and 1am.

// A local "YYYY-MM-DD" day key, built from local date parts. Matches the key
// format react-native-calendars uses, and calendarDateString in history.jsx.
export const localDateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Turn a calendar day back into the instant to store: that local day, at the
// given local time of day. It has to go through the Date constructor's
// local-time form. Pasting the day in front of toISOString()'s time part — the
// obvious-looking fix — concatenates a local date with a UTC clock time, which
// at 00:30 BST stores the entry a full day in the FUTURE.
export const instantForCalendarDay = (dayKey, now) => {
    const [y, m, d] = dayKey.split('-').map(Number);
    return new Date(
        y, m - 1, d,
        now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()
    ).toISOString();
};
