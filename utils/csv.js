// A CSV reader for the two files this app ingests: Strong's export and our own.
//
// It exists because PapaParse is pathologically slow on exactly the shape of
// file Strong produces. Measured on a release build, a 1.06 MB Strong export
// (9,441 rows):
//
//     Papa.parse .............. 184 s
//     turning rows into sets .... 0.1 s
//     writing 8,620 sets ....... 21 s
//
// Strong quotes EVERY field -- 245,496 quote characters in that file -- so
// PapaParse's fast path is off and its quote-handling loop runs 122,748 times,
// building substrings as it goes. That is the whole three-and-a-half minutes.
//
// This is a single forward scan: find the end of each field with indexOf and
// slice it out once. It is a smaller promise than PapaParse -- no streaming, no
// type coercion, no comment lines -- but it is the promise these two files
// need, and it is checked field-for-field against PapaParse's output on the
// real export.

const QUOTE = 34;   // "
const CR = 13;
const LF = 10;

// Ordered by preference, so a file that somehow parses equally well under two
// of them resolves the same way every time.
const DELIMITERS = [',', ';', '\t', '|'];

/**
 * Read `src` into rows of raw string fields.
 *
 * `maxRows` stops early, which is what delimiter detection uses -- there is no
 * point parsing a megabyte to find out how the header line splits.
 */
const parseRecords = (src, delimiterCode, maxRows) => {
    const rows = [];
    const n = src.length;
    let fields = [];
    let i = 0;
    // True when the last thing consumed was a delimiter, so the file ending
    // right there still owes one empty field.
    let fieldPending = false;

    while (i < n) {
        let value;

        if (src.charCodeAt(i) === QUOTE) {
            // Quoted field. Runs to the next lone quote; a doubled quote ("")
            // is one literal quote and the field continues.
            i += 1;
            let start = i;
            let buf = null;
            for (;;) {
                const q = src.indexOf('"', i);
                if (q === -1) {
                    // Unterminated quote: take the rest of the file rather than
                    // dropping data. Malformed input, but silently losing the
                    // tail would be worse.
                    value = (buf === null ? '' : buf) + src.slice(start);
                    i = n;
                    break;
                }
                const after = q + 1 < n ? src.charCodeAt(q + 1) : -1;
                if (after === QUOTE) {
                    // "" is one literal quote and the field carries on.
                    buf = (buf === null ? '' : buf) + src.slice(start, q + 1);
                    i = q + 2;
                    start = i;
                    continue;
                }
                if (after === -1 || after === delimiterCode || after === LF || after === CR) {
                    value = (buf === null ? '' : buf) + src.slice(start, q);
                    i = q + 1;
                    break;
                }
                // A bare quote in the middle of the field: the exporter failed
                // to escape it. Only a quote with a delimiter, a newline or the
                // end of the file after it actually closes a field, so keep
                // looking. One of the user's own notes is exactly this --
                //   ;""lengthened partials" LOL, slight shoulder twinge? ...";
                // -- and closing at the first bare quote reads the whole field
                // one character out of step.
                i = q + 1;
            }
        } else {
            const start = i;
            while (i < n) {
                const c = src.charCodeAt(i);
                if (c === delimiterCode || c === LF || c === CR) break;
                i += 1;
            }
            value = src.slice(start, i);
        }

        fields.push(value);
        fieldPending = false;

        if (i >= n) break;

        const c = src.charCodeAt(i);
        if (c === delimiterCode) {
            i += 1;
            fieldPending = true;
            continue;
        }

        // End of record. CRLF, LF and a lone CR all count as one break.
        if (c === CR) {
            i += 1;
            if (src.charCodeAt(i) === LF) i += 1;
        } else {
            i += 1;
        }
        rows.push(fields);
        fields = [];
        if (maxRows && rows.length >= maxRows) return rows;
    }

    // A file that does not end in a newline still has a last record.
    if (fieldPending) fields.push('');
    if (fields.length > 0) rows.push(fields);
    return rows;
};

/**
 * Which character separates the fields.
 *
 * Strong uses semicolons, our own export uses commas. A delimiter that is not
 * the file's own leaves the header as a single field, so counting the fields
 * the header splits into is a decision rather than a guess.
 */
export const detectDelimiter = (src) => {
    let best = DELIMITERS[0];
    let bestCount = 0;
    for (const d of DELIMITERS) {
        const rows = parseRecords(src, d.charCodeAt(0), 1);
        const count = rows.length > 0 ? rows[0].length : 0;
        if (count > bestCount) {
            bestCount = count;
            best = d;
        }
    }
    return best;
};

/**
 * Parse a CSV with a header row into objects keyed by column name.
 *
 * Matches the PapaParse call it replaces (`header: true, skipEmptyLines: true`)
 * including its edge behaviour: a short row simply has no key for the missing
 * columns, and a long one puts the surplus in `__parsed_extra`.
 */
export const parseCsv = (text, delimiter, transformHeader) => {
    if (typeof text !== 'string' || text.length === 0) {
        return { data: [], delimiter: DELIMITERS[0] };
    }

    // Strip a UTF-8 BOM. Strong and Excel both emit one, and it would otherwise
    // become part of the first column's name -- so `row['Workout #']` would be
    // undefined for every row in the file.
    const src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;

    const delim = delimiter || detectDelimiter(src);
    const records = parseRecords(src, delim.charCodeAt(0), 0);
    if (records.length === 0) return { data: [], delimiter: delim };

    const header = transformHeader ? records[0].map(transformHeader) : records[0];
    const width = header.length;
    const data = [];

    for (let r = 1; r < records.length; r++) {
        const fields = records[r];

        // skipEmptyLines: a blank line reads as one empty field.
        if (fields.length === 1 && fields[0].length === 0) continue;

        const row = {};
        const shared = fields.length < width ? fields.length : width;
        for (let c = 0; c < shared; c++) row[header[c]] = fields[c];
        if (fields.length > width) row.__parsed_extra = fields.slice(width);
        data.push(row);
    }

    return { data, delimiter: delim };
};
