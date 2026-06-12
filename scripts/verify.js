/**
 * End-to-end verification for the storage-layer / packaging improvements.
 * Not part of the published package — run with `node scripts/verify.js`.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SnapDB = require('../index.js');

const DB_DIR = 'verifyRun';
const dbPath = path.join(process.cwd(), DB_DIR);

function cleanup() {
    fs.rmSync(dbPath, { recursive: true, force: true });
}

async function main() {
    cleanup();
    let passed = 0;
    const ok = (name) => { console.log(`  ✓ ${name}`); passed++; };

    // 1. No lost writes on rapid sequential inserts.
    {
        const db = new SnapDB(DB_DIR);
        await db.createCollection('seq', ['name']);
        for (let i = 0; i < 1000; i++) {
            await db.insert('seq', { name: `n${i}` });
        }
        const all = await db.getCollection('seq');
        assert.strictEqual(all.length, 1000, `expected 1000, got ${all.length}`);
        ok('1000 rapid sequential inserts all persist');
    }

    // 2. No lost writes under concurrent inserts.
    {
        const db = new SnapDB(DB_DIR);
        await db.createCollection('conc', ['name']);
        await Promise.all(
            Array.from({ length: 50 }, (_, i) => db.insert('conc', { name: `c${i}` }))
        );
        const all = await db.getCollection('conc');
        assert.strictEqual(all.length, 50, `expected 50, got ${all.length}`);
        ok('50 concurrent inserts all persist');
    }

    // 3. CSV escaping round-trips commas, quotes and newlines.
    {
        const db = new SnapDB(DB_DIR);
        await db.createCollection('esc', ['text']);
        const tricky = 'a,b "quoted"\nsecond line, more';
        const { newRecordId } = await db.insert('esc', { text: tricky });
        const rec = await db.findById(newRecordId, 'esc');
        assert.strictEqual(rec.text, tricky, `escaping mismatch: ${JSON.stringify(rec.text)}`);
        const all = await db.getCollection('esc');
        assert.strictEqual(all.length, 1, 'escaped newline must not create extra rows');
        ok('comma/quote/newline values round-trip exactly');
    }

    // 4. Atomic update keeps row count and applies changes.
    {
        const db = new SnapDB(DB_DIR);
        await db.createCollection('upd', ['name', 'age']);
        const ids = [];
        for (const n of ['a', 'b', 'c']) {
            const r = await db.insert('upd', { name: n, age: 1 });
            ids.push(r.newRecordId);
        }
        await db.updateById(ids[1], { age: 99 }, 'upd');
        const all = await db.getCollection('upd');
        assert.strictEqual(all.length, 3, `update changed row count: ${all.length}`);
        const updated = all.find(r => r.name === 'b');
        assert.strictEqual(updated.age, 99, 'update did not apply');
        assert.strictEqual(all.filter(r => r.name === 'b').length, 1, 'duplicate row after update');
        ok('updateById is atomic (count stable, value applied)');
    }

    // 5. Query streaming + limit early-exit returns correct rows.
    {
        const db = new SnapDB(DB_DIR, { enableCache: false });
        await db.createCollection('big', ['v']);
        const rows = Array.from({ length: 5000 }, (_, i) => ({ v: i }));
        await db.insertMany('big', rows);
        const res = await db.query('big').where('v', '>=', 10).limit(5).execute();
        assert.strictEqual(res.length, 5, `expected 5, got ${res.length}`);
        assert.deepStrictEqual(res.map(r => r.v), [10, 11, 12, 13, 14]);
        const total = await db.query('big').where('v', '<', 100).count();
        assert.strictEqual(total, 100, `count mismatch: ${total}`);
        ok('query streaming + limit early-exit works on large collection');
    }

    // 6. Sorted query still correct.
    {
        const db = new SnapDB(DB_DIR);
        await db.createCollection('sorted', ['v']);
        await db.insertMany('sorted', [{ v: 3 }, { v: 1 }, { v: 2 }]);
        const res = await db.query('sorted').orderBy('v', 'desc').limit(2).execute();
        assert.deepStrictEqual(res.map(r => r.v), [3, 2]);
        ok('sorted query with limit returns correct order');
    }

    // 7. Error subpath import resolves.
    {
        const errors = require('../errors');
        assert.ok(errors.RecordNotFoundError, 'RecordNotFoundError missing');
        assert.ok(errors.ValidationError, 'ValidationError missing');
        ok('errors module exports all error classes');
    }

    cleanup();
    console.log(`\nAll ${passed} checks passed.`);
}

main().catch((err) => {
    cleanup();
    console.error('\nVERIFY FAILED:', err);
    process.exit(1);
});
