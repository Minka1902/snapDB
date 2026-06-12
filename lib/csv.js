/**
 * Internal CSV storage layer for SnapDB.
 *
 * Replaces the previous `csv-for-you` dependency, whose row-mutation functions
 * (addRow/deleteRows/editRow) were callback-based and returned `undefined`, so
 * `await`-ing them did not actually wait for the write to finish — causing lost
 * writes under rapid or concurrent operations. This module provides:
 *
 *   - Promise-based reads and writes (fs.promises).
 *   - RFC-4180 field quoting/escaping (commas, quotes and newlines are safe).
 *   - Atomic rewrites via a temp file + rename.
 *   - A per-file write queue (in-process mutex) so concurrent mutations on the
 *     same collection cannot interleave and clobber each other.
 *   - Streaming reads for large collections.
 *
 * The on-disk format is unchanged from the previous implementation: comma
 * delimited, with nested arrays/objects serialized using `;` separators inside
 * `[...]` / `{...}`. Reads reproduce the same value coercion (numbers, nested
 * structures, empty -> null) so existing data files keep working.
 */

const fs = require('fs');
const fsp = fs.promises;

const NEWLINE = '\n';

// ---------------------------------------------------------------------------
// Per-file write serialization (in-process mutex)
// ---------------------------------------------------------------------------

const _chains = new Map();

/**
 * Runs `task` after any previously-queued task for the same `key` has settled,
 * guaranteeing read-modify-write operations on one file never interleave.
 * @param {string} key - Usually the file path.
 * @param {Function} task - Async function to run exclusively.
 * @returns {Promise<*>} Resolves/rejects with the task's result.
 */
function withLock(key, task) {
    const prev = _chains.get(key) || Promise.resolve();
    const result = prev.then(() => task(), () => task());
    // The stored tail swallows errors so the lock chain keeps flowing.
    const tail = result.then(() => {}, () => {});
    _chains.set(key, tail);
    tail.then(() => {
        if (_chains.get(key) === tail) _chains.delete(key);
    });
    return result;
}

// ---------------------------------------------------------------------------
// Value <-> string serialization
// ---------------------------------------------------------------------------

const hasLetters = (v) => /[a-zA-Z]/.test(v);

const hasNumbersOnly = (v) => v !== '' && /^[0-9. ]+$/.test(v);

/** Serializes a nested value (inside arrays/objects) using `;` separators. */
function nestedToString(v) {
    if (Array.isArray(v)) {
        return '[' + v.map(nestedToString).join(';') + ']';
    }
    if (v && typeof v === 'object') {
        return '{' + Object.entries(v)
            .map(([k, val]) => `${k}:${nestedToString(val)}`)
            .join(';') + '}';
    }
    return String(v);
}

/** Converts a field value into its on-disk string form (pre-escaping). */
function fieldToString(v) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v) || (typeof v === 'object')) return nestedToString(v);
    return String(v);
}

/** RFC-4180 quoting: wrap in quotes only when the value needs it. */
function escapeField(str) {
    if (/[",\n\r]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/** Serializes a record object into one CSV line, in header order. */
function serializeRow(obj, headers) {
    return headers.map(h => escapeField(fieldToString(obj[h]))).join(',');
}

// ---------------------------------------------------------------------------
// Nested value parsing (ported to match the previous format semantics)
// ---------------------------------------------------------------------------

function parseObject(str) {
    str = str.slice(1, -1);
    const obj = {};
    let value = '';
    const stack = [];
    let currentObj = obj;
    let currentKey = '';
    let isReadingKey = true;

    const findClosingBracket = (s, startIndex, open, close) => {
        let depth = 0;
        for (let i = startIndex; i < s.length; i++) {
            if (s[i] === open) depth++;
            if (s[i] === close) depth--;
            if (depth === 0) return i;
        }
        return -1;
    };

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '{') {
            stack.push(currentObj);
            currentObj[currentKey.trim()] = {};
            currentObj = currentObj[currentKey.trim()];
            currentKey = '';
            isReadingKey = true;
        } else if (char === '}') {
            if (currentKey) {
                currentObj[currentKey.trim()] = hasNumbersOnly(value) ? Number(value.trim()) : value.trim();
                currentKey = '';
                value = '';
            }
            currentObj = stack.pop();
        } else if (char === '[') {
            const arrayEndIndex = findClosingBracket(str, i, '[', ']');
            const arrayString = str.slice(i, arrayEndIndex + 1);
            currentObj[currentKey.trim()] = parseArray(arrayString);
            i = arrayEndIndex;
            currentKey = '';
            value = '';
            isReadingKey = true;
        } else if (char === ':') {
            isReadingKey = false;
        } else if (char === ';') {
            if (currentKey) {
                currentObj[currentKey.trim()] = hasNumbersOnly(value) ? Number(value.trim()) : value.trim();
                currentKey = '';
                value = '';
            }
            isReadingKey = true;
        } else if (isReadingKey) {
            currentKey += char;
        } else {
            value += char;
        }
    }

    if (currentKey) {
        currentObj[currentKey.trim()] = hasNumbersOnly(value) ? Number(value.trim()) : value.trim();
    }
    return obj;
}

function parseArray(str) {
    str = str.slice(1, -1);
    const result = [];
    let temp = '';
    let nestedLevel = 0;

    for (const char of str) {
        if (char === '[' || char === '{') {
            nestedLevel++;
            temp += char;
        } else if (char === ']' || char === '}') {
            nestedLevel--;
            temp += char;
        } else if (char === ';' && nestedLevel === 0) {
            result.push(temp);
            temp = '';
        } else {
            temp += char;
        }
    }
    if (temp) result.push(temp);

    return result.map((item) => {
        if (item.startsWith('[') && item.endsWith(']')) return parseArray(item);
        if (item.startsWith('{') && item.endsWith('}')) return parseObject(item);
        if (hasNumbersOnly(item)) return Number(item);
        if (hasLetters(item)) return item;
        return item;
    });
}

/** Coerces one already-unquoted field string into a typed value. */
function coerceValue(prop, value, returnAsString) {
    if (returnAsString.includes(prop)) return value;
    if (value.startsWith('{') && value.endsWith('}')) return parseObject(value);
    if (value.startsWith('[') && value.endsWith(']')) return parseArray(value);
    if (hasLetters(value)) return value;
    if (hasNumbersOnly(value)) return Number(value);
    if (value === '') return null;
    return value;
}

// ---------------------------------------------------------------------------
// Quote-aware tokenizer (handles embedded commas, quotes and newlines)
// ---------------------------------------------------------------------------

class Tokenizer {
    constructor() {
        this.fields = [];
        this.cur = '';
        this.inQuotes = false;
        this.pendingQuote = false; // a quote ended a chunk; resolve at next push
    }

    /** Feeds a chunk of text, returning any complete records (arrays of fields). */
    push(text) {
        const out = [];
        let i = 0;

        if (this.pendingQuote) {
            this.pendingQuote = false;
            if (text[0] === '"') {
                this.cur += '"';
                i = 1;
            } else {
                this.inQuotes = false;
            }
        }

        for (; i < text.length; i++) {
            const c = text[i];
            if (this.inQuotes) {
                if (c === '"') {
                    if (i + 1 < text.length) {
                        if (text[i + 1] === '"') { this.cur += '"'; i++; }
                        else { this.inQuotes = false; }
                    } else {
                        this.pendingQuote = true;
                    }
                } else {
                    this.cur += c;
                }
            } else if (c === '"' && this.cur === '') {
                this.inQuotes = true;
            } else if (c === ',') {
                this.fields.push(this.cur);
                this.cur = '';
            } else if (c === '\n') {
                if (this.cur.endsWith('\r')) this.cur = this.cur.slice(0, -1);
                this.fields.push(this.cur);
                this.cur = '';
                out.push(this.fields);
                this.fields = [];
            } else {
                this.cur += c;
            }
        }
        return out;
    }

    /** Flushes any trailing record not terminated by a newline. */
    end() {
        if (this.pendingQuote) { this.pendingQuote = false; this.inQuotes = false; }
        if (this.cur !== '' || this.fields.length > 0) {
            if (this.cur.endsWith('\r')) this.cur = this.cur.slice(0, -1);
            this.fields.push(this.cur);
            const rec = this.fields;
            this.fields = [];
            this.cur = '';
            return rec;
        }
        return null;
    }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Reads a CSV file into headers + raw field records (no coercion).
 * @returns {Promise<{headers: string[], records: string[][]}>}
 */
async function readRaw(filePath) {
    const text = await fsp.readFile(filePath, 'utf8');
    const tok = new Tokenizer();
    const records = tok.push(text);
    const last = tok.end();
    if (last) records.push(last);

    if (records.length === 0) return { headers: [], records: [] };
    const headers = records[0].map(h => h.trim());
    return { headers, records: records.slice(1) };
}

/**
 * Parses a CSV file into an array of row objects.
 * @param {string} filePath
 * @param {Object} [options]
 * @param {string[]} [options.returnAsString=[]] - Fields to keep as raw strings.
 * @returns {Promise<Array<Object>>}
 */
async function parse(filePath, options = {}) {
    const returnAsString = options.returnAsString || [];
    const { headers, records } = await readRaw(filePath);
    return records.map(fields => rowToObject(fields, headers, returnAsString));
}

/** Builds a typed row object from raw fields, matching legacy coercion. */
function rowToObject(fields, headers, returnAsString) {
    const obj = {};
    for (let i = 0; i < fields.length; i++) {
        const prop = headers[i];
        if (prop === undefined) continue;
        obj[prop] = coerceValue(prop, fields[i], returnAsString);
    }
    return obj;
}

/**
 * Streams a CSV file as typed row objects, without buffering the whole file.
 * @param {string} filePath
 * @param {Object} [options]
 * @param {string[]} [options.returnAsString=[]]
 * @returns {AsyncGenerator<Object>}
 */
async function* streamRows(filePath, options = {}) {
    const returnAsString = options.returnAsString || [];
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const tok = new Tokenizer();
    let headers = null;

    try {
        for await (const chunk of stream) {
            for (const fields of tok.push(chunk)) {
                if (!headers) { headers = fields.map(h => h.trim()); continue; }
                yield rowToObject(fields, headers, returnAsString);
            }
        }
        const last = tok.end();
        if (last) {
            if (!headers) headers = last.map(h => h.trim());
            else yield rowToObject(last, headers, returnAsString);
        }
    } finally {
        stream.destroy();
    }
}

// ---------------------------------------------------------------------------
// Writing (all mutations are serialized per file and crash-safe)
// ---------------------------------------------------------------------------

/** Atomically replaces a file's contents via a temp file + rename. */
async function atomicWrite(filePath, content) {
    const tmp = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
    await fsp.writeFile(tmp, content);
    try {
        await fsp.rename(tmp, filePath);
    } catch (err) {
        await fsp.unlink(tmp).catch(() => {});
        throw err;
    }
}

/** Rewrites a whole collection from headers + row objects. */
function writeAll(filePath, headers, rows) {
    return withLock(filePath, async () => {
        let content = headers.join(',') + NEWLINE;
        for (const row of rows) content += serializeRow(row, headers) + NEWLINE;
        await atomicWrite(filePath, content);
    });
}

/** Appends a single record. */
function appendRow(filePath, obj, headers) {
    return withLock(filePath, () =>
        fsp.appendFile(filePath, serializeRow(obj, headers) + NEWLINE));
}

/** Appends many records in a single write. */
function appendRows(filePath, objs, headers) {
    return withLock(filePath, () => {
        const lines = objs.map(o => serializeRow(o, headers) + NEWLINE).join('');
        return fsp.appendFile(filePath, lines);
    });
}

/**
 * Atomically deletes every row whose `field` equals `value`.
 * @returns {Promise<number>} Number of rows removed.
 */
function deleteByField(filePath, field, value) {
    return withLock(filePath, async () => {
        const { headers, records } = await readRaw(filePath);
        const fieldIndex = headers.indexOf(field);
        if (fieldIndex === -1) return 0;

        const target = String(value);
        const kept = records.filter(fields => fields[fieldIndex] !== target);
        const removed = records.length - kept.length;
        if (removed === 0) return 0;

        let content = headers.join(',') + NEWLINE;
        for (const fields of kept) content += fields.map(escapeField).join(',') + NEWLINE;
        await atomicWrite(filePath, content);
        return removed;
    });
}

/**
 * Atomically replaces the first row whose `field` equals `value` with `newObj`,
 * preserving the position of all other rows.
 * @returns {Promise<boolean>} True if a row was replaced.
 */
function updateByField(filePath, field, value, newObj, headers) {
    return withLock(filePath, async () => {
        const { headers: fileHeaders, records } = await readRaw(filePath);
        const cols = headers || fileHeaders;
        const fieldIndex = cols.indexOf(field);
        if (fieldIndex === -1) return false;

        const target = String(value);
        const idx = records.findIndex(fields => fields[fieldIndex] === target);
        if (idx === -1) return false;

        let content = cols.join(',') + NEWLINE;
        for (let i = 0; i < records.length; i++) {
            content += (i === idx)
                ? serializeRow(newObj, cols) + NEWLINE
                : records[i].map(escapeField).join(',') + NEWLINE;
        }
        await atomicWrite(filePath, content);
        return true;
    });
}

module.exports = {
    parse,
    streamRows,
    appendRow,
    appendRows,
    writeAll,
    deleteByField,
    updateByField,
    // exported for testing
    escapeField,
    serializeRow,
};
