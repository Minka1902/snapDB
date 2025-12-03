const SnapDB = require('./lib/snapDB');

module.exports = SnapDB;

// ============================================================
// DEMO: How emit() works in EventEmitter
// ============================================================

async function emitDemo() {
    console.log('=== EventEmitter emit() Demo ===\n');

    const db = new SnapDB('emitDemo');

    // Step 1: Register multiple listeners for the same event
    console.log('📝 Registering listeners...\n');

    db.on('afterInsert', (data) => {
        console.log('  [Listener 1] Record inserted:', data.data.number);
    });

    db.on('afterInsert', async (data) => {
        console.log('  [Listener 2] Logging to console...');
        console.log('  [Listener 2] Collection:', data.collectionName);
    });

    db.on('afterInsert', async (data) => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('  [Listener 3] Delayed async task completed! ✓');
    });

    // Step 2: Create collection
    await db.createCollection('items', ['number', 'name']);

    // Step 3: Insert a record - this triggers emit()
    console.log('\n🚀 Inserting record (this triggers emit())...\n');
    
    await db.insert('items', { number: 1, name: 'First Item' });
    
    console.log('\n✅ All listeners executed!\n');

    // Step 4: Show what happens internally
    console.log('--- What happened internally ---');
    console.log('1. db.insert() was called');
    console.log('2. Before inserting, it called: await this.events.emit("afterInsert", {...})');
    console.log('3. emit() found 3 registered listeners in this.events.get("afterInsert")');
    console.log('4. emit() executed them ONE BY ONE with await:');
    console.log('   - Listener 1: Ran synchronously, printed record number');
    console.log('   - Listener 2: Ran async, printed collection name');
    console.log('   - Listener 3: Ran async with delay, completed after 100ms');
    console.log('5. All listeners completed, insert() continued');
    console.log('\n💡 Key: emit() runs listeners IN ORDER, waits for async ones!\n');
}

// Run demo if executed directly
if (require.main === module) {
    emitDemo().catch(console.error);
}
