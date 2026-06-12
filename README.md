# SnapDB

A lightweight, file-based CSV database with intelligent caching and advanced query capabilities. Perfect for rapid prototyping, small-scale applications, and local development without the overhead of a traditional database.

## 📦 Installation

```bash
npm install snap4db
```

## ✨ Features

- ✅ **CSV-backed collections** - Simple file-based storage
- ✅ **Auto-generated IDs** - Unique 24-character identifiers
- ✅ **CRUD operations** - Create, Read, Update, Delete
- ✅ **Advanced queries** - QueryBuilder with filtering, sorting, and limits
- ✅ **Smart caching** - Configurable TTL-based caching for performance
- ✅ **Collection management** - List, create, and delete collections
- ✅ **Database metrics** - Calculate total database size

## 🚀 Usage : Node | Typescript

<details open>
<summary><strong>Node (CommonJS)</strong></summary>

```js
const SnapDB = require('snap4db');

// Initialize database with optional caching configuration
const db = new SnapDB('myDatabase', {
  enableCache: true,  // default: true
  cacheTTL: 5000      // default: 5000ms
});

// Create a collection
await db.createCollection('users', ['username', 'email', 'age']);

// Insert records
const user = await db.insert('users', {
  username: 'john_doe',
  email: 'john@example.com',
  age: 28
});

console.log(user.newRecordId); // Auto-generated ID

// Query
const results = await db.query('users')
  .where('age', '>', 18)
  .orderBy('age', 'desc')
  .limit(5)
  .execute();
```

</details>

<details>
<summary><strong>TypeScript</strong></summary>

```ts
import SnapDB from 'snap4db';

type User = { username: string; email: string; age: number; createdAt?: string };

const db = new SnapDB('myDatabase', { enableCache: true, cacheTTL: 5000 });

await db.createCollection('users', ['username', 'email', 'age', 'createdAt']);

const { newRecordId } = await db.insert('users', {
  username: 'jane',
  email: 'jane@example.com',
  age: 29,
  createdAt: new Date().toISOString()
});

const users: User[] = await db.getCollection<User>('users');

const older: User[] = await db
  .query<User>('users')
  .where('age', '>', 25)
  .orderBy('age', 'desc')
  .execute();

// Errors
import { RecordNotFoundError } from 'snap4db/errors';

try {
  await db.findById<User>('nonexistent', 'users');
} catch (e) {
  if (e instanceof RecordNotFoundError) {
    // handle gracefully
  }
}
```

</details>

## 📚 API Reference

### Constructor

```js
new SnapDB(dbName, options)
```

- `dbName` (string) - Database directory name (default: 'DATABASE')
- `options.enableCache` (boolean) - Enable caching (default: true)
- `options.cacheTTL` (number) - Cache time-to-live in ms (default: 5000)
- `options.enableLogging` (boolean) - Enable request/response logging (default: false)

### Collections

#### Create Collection
```js
await db.createCollection('users', ['name', 'email', 'age']);
```

#### Check if Collection Exists
```js
const exists = db.collectionExists('users');
if (exists) {
  console.log('Collection exists!');
}
```

#### Get All Collections
```js
const collections = await db.getCollectionNames();
```

#### Get Collection Data
```js
const users = await db.getCollection('users');
```

#### Delete Collection
```js
await db.deleteCollectionByName('users');
```

### Records

#### Insert
```js
const result = await db.insert('users', {
  name: 'Alice',
  email: 'alice@example.com'
});
```

#### Insert Many
```js
const result = await db.insertMany('users', [
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com' },
  { name: 'Charlie', email: 'charlie@example.com' }
]);
// Returns: { message: '3 records created.', newRecordIds: [...], count: 3 }
```

#### Find by ID
```js
// Search in specific collection
const user = await db.findById('abc123', 'users');

// Search across all collections
const record = await db.findById('abc123');
```

#### Update by ID
```js
await db.updateById('abc123', {
  email: 'newemail@example.com',
  age: 30
}, 'users');
```

#### Update Many
```js
const result = await db.updateMany([
  { id: 'abc123', updates: { age: 30 }, collectionName: 'users' },
  { id: 'def456', updates: { status: 'active' }, collectionName: 'users' }
]);
// Returns: { message: '2 record(s) updated.', updatedIds: [...], failedIds: [], count: 2 }
```

#### Delete by ID
```js
await db.deleteById('abc123', 'users');
```

#### Delete Many
```js
const result = await db.deleteMany(['abc123', 'def456', 'ghi789'], 'users');
// Returns: { message: '3 record(s) deleted.', deletedIds: [...], notFoundIds: [], count: 3 }
```

### Advanced Queries (QueryBuilder)

```js
// Complex filtering with chaining
const results = await db.query('users')
  .where('age', '>', 18)
  .where('status', '=', 'active')
  .orderBy('age', 'desc')
  .limit(10)
  .execute();

// Pagination
const page2 = await db.query('users')
  .orderBy('createdAt', 'desc')
  .paginate(2, 20)  // Page 2, 20 items per page
  .execute();

// Or use offset + limit manually
const results = await db.query('users')
  .orderBy('createdAt', 'desc')
  .offset(20)
  .limit(10)
  .execute();

// Aggregations
const totalUsers = await db.query('users').count();
const activeUsers = await db.query('users').where('status', '=', 'active').count();

const totalRevenue = await db.query('orders').sum('amount');
const avgAge = await db.query('users').avg('age');
const minPrice = await db.query('products').min('price');
const maxScore = await db.query('scores').where('game', '=', 'chess').max('points');
```

**Supported operators:**
- `=` - Equals
- `!=` - Not equals
- `>` - Greater than
- `<` - Less than
- `>=` - Greater than or equal
- `<=` - Less than or equal
- `contains` - String contains
- `!contains` - String does not contain
- `in` - Value in array
- `!in` - Value not in array
- `like` - SQL-like pattern (`%` = wildcard, `_` = single char)
- `!like` - Negated pattern match

**Advanced Query Methods:**

```js
// OR conditions
const results = await db.query('users')
  .where('role', '=', 'admin')
  .orWhere('role', '=', 'moderator')
  .execute();

// IN operator
const results = await db.query('users')
  .where('status', 'in', ['active', 'pending', 'verified'])
  .execute();

// LIKE operator (SQL-style patterns)
const results = await db.query('users')
  .where('email', 'like', '%@gmail.com')  // Ends with @gmail.com
  .execute();

const results = await db.query('products')
  .where('name', 'like', 'iPhone%')  // Starts with iPhone
  .execute();

// NULL checks
const usersWithoutEmail = await db.query('users')
  .whereNull('email')
  .execute();

const usersWithEmail = await db.query('users')
  .whereNotNull('email')
  .execute();

// Date operations
const recentOrders = await db.query('orders')
  .whereDate('createdAt', '>', new Date('2025-01-01'))
  .execute();

const ordersInRange = await db.query('orders')
  .whereDateBetween('createdAt', '2025-01-01', '2025-12-31')
  .execute();
```
### Backup & Restore

#### Create Backup
```js
// Backup entire database
await db.backup('./backups/mydb-backup.json');

// Backup specific collection
await db.backup('./backups/users-backup.json', 'users');
```

#### Restore from Backup
```js
// Restore (skip existing collections)
await db.restore('./backups/mydb-backup.json');

// Restore and overwrite existing collections
await db.restore('./backups/mydb-backup.json', { overwrite: true });
```

#### Export/Import Data Programmatically
```js
// Export to object
const backupData = await db.exportData(); // All collections
const userData = await db.exportData('users'); // Single collection

// Import from object
await db.importData(backupData, { overwrite: true });
```

### Events & Hooks

SnapDB emits events for all CRUD operations, allowing you to hook into the lifecycle:

```js
// Before operations
db.on('beforeInsert', ({ collectionName, data }) => {
  console.log('About to insert:', data);
  // Validate, transform, or log data
});

db.on('beforeUpdate', ({ id, updates, collectionName }) => {
  console.log('About to update record:', id);
});

db.on('beforeDelete', ({ id, collectionName }) => {
  console.log('About to delete record:', id);
});

// After operations
db.on('afterInsert', ({ collectionName, data, result }) => {
  console.log('Inserted new record:', result.newRecordId);
});

db.on('afterUpdate', ({ id, updates, collectionName, result }) => {
  console.log('Updated record:', id);
});

db.on('afterDelete', ({ id, collectionName, result }) => {
  console.log('Deleted record:', id);
});

// Error handling
db.on('insertError', ({ collectionName, data, error }) => {
  console.error('Insert failed:', error.message);
});

db.on('updateError', ({ id, updates, error }) => {
  console.error('Update failed:', error.message);
});

db.on('deleteError', ({ id, error }) => {
  console.error('Delete failed:', error.message);
});

// One-time listener
db.once('afterInsert', ({ result }) => {
  console.log('First insert:', result.newRecordId);
});

// Remove listener
const listener = () => console.log('Event fired');
db.on('afterInsert', listener);
db.off('afterInsert', listener);
```

**Available Events:**
- `beforeInsert`, `afterInsert`, `insertError`
- `beforeUpdate`, `afterUpdate`, `updateError`
- `beforeDelete`, `afterDelete`, `deleteError`

### Utilities

#### Calculate Database Size
```js
const bytes = await db.calcDBSize();
console.log(`Database size: ${bytes} bytes`);
```

#### Clear Caches
```js
db.clearAllCaches();
```

#### Generate ID
```js
const id = db.generateId();

#### Get Logs
```js
// Get recent request logs
const requests = await db.getLogs('requests', 50);

// Get recent response logs
const responses = await db.getLogs('responses', 50);
```
// Get a specific log pair (request + response) by request log ID
const { request, response } = await db.getLogById(requests[0]?.logId);
// You can limit search to a specific log type
const onlyRequest = await db.getLogById(requests[0]?.logId, 'requests');
const onlyResponse = await db.getLogById(requests[0]?.logId, 'responses');
console.log(request?.method, response?.success);


#### Clear Logs
```js
await db.clearLogs();
```
```

## 📁 Project Structure

## 📊 Logging System

SnapDB includes a comprehensive logging system that tracks all database operations with unique 16-character request IDs.

### Enable Logging

```js
const db = new SnapDB('myDB', { enableLogging: true });
```

### Log Structure

**Request Log Entry:**
```json
{
  "logId": "a1b2c3d4e5f6g7h8",
  "timestamp": "2025-12-01T10:30:45.123Z",
  "type": "REQUEST",
  "method": "insert",
  "params": { "collectionName": "users", "data": { "username": "alice" } },
  "pid": 12345,
  "memory": { "heapUsed": 15728640 }
}
```

**Response Log Entry:**
```json
{
  "reqLogId": "a1b2c3d4e5f6g7h8",
  "timestamp": "2025-12-01T10:30:45.156Z",
  "type": "RESPONSE",
  "method": "insert",
  "success": true,
  "duration": "33ms",
  "result": { "message": "Record created.", "newRecordId": "..." },
  "error": null,
  "pid": 12345,
  "memory": { "heapUsed": 15892480 }
}
```

### Features

- **16-character unique IDs** for each request
- **Request-Response linking** via `reqLogId`
- **Automatic sensitive data redaction** (password, token, secret, apiKey, auth)
- **Performance metrics** (duration, memory usage)
- **Error tracking** with full stack traces
- **JSON-formatted logs** stored in `{dbPath}/.logs/`
  - `requests.log` - All incoming requests
  - `responses.log` - All responses with linked request IDs

### Example

```js
const db = new SnapDB('myDB', { enableLogging: true });

await db.insert('users', { username: 'alice', password: 'secret' });

// View logs
const requests = await db.getLogs('requests', 10);
const responses = await db.getLogs('responses', 10);

console.log(requests[0]);
// { logId: 'a1b2...', method: 'insert', params: { data: { password: '[REDACTED]' } } }

console.log(responses[0]);
// { reqLogId: 'a1b2...', success: true, duration: '15ms', result: {...} }
```

```
snapDB/
├── lib/
│   ├── SnapDB.js         # Main database class
│   ├── QueryBuilder.js   # Query builder for advanced filtering
│   └── constants.js      # Configuration constants
├── index.js              # Package entry point
├── package.json
└── README.md
```

## 💡 Examples

### User Management System

```js
const SnapDB = require('snap4db');
const db = new SnapDB('myApp');

// Setup
await db.createCollection('users', [
  'username', 'email', 'password', 'role', 'createdAt'
]);

// Insert users
await db.insert('users', {
  username: 'admin',
  email: 'admin@app.com',
  password: 'hashed_password',
  role: 'admin',
  createdAt: new Date().toISOString()
});

// Query active admins
const admins = await db.query('users')
  .where('role', '=', 'admin')
  .orderBy('createdAt', 'desc')
  .execute();

// Update user
await db.updateById(userId, {
  email: 'newemail@app.com'
}, 'users');
```

### Blog Posts with Comments

```js
// Create collections
await db.createCollection('posts', ['title', 'content', 'authorId', 'createdAt']);
await db.createCollection('comments', ['postId', 'userId', 'text', 'createdAt']);

// Create post
const post = await db.insert('posts', {
  title: 'Hello World',
  content: 'My first post',
  authorId: 'user123',
  createdAt: new Date().toISOString()
});

// Add comment
await db.insert('comments', {
  postId: post.newRecordId,
  userId: 'user456',
  text: 'Great post!',
  createdAt: new Date().toISOString()
});

// Get recent posts
const recentPosts = await db.query('posts')
  .orderBy('createdAt', 'desc')
  .limit(5)
  .execute();
```

## ⚙️ Configuration

### Caching Strategy

SnapDB implements a two-tier caching system:

1. **Header Cache** - Stores column headers indefinitely until cache is cleared
2. **Collection Cache** - Stores full collection data with configurable TTL

```js
const db = new SnapDB('myDB', {
  enableCache: true,  // Toggle caching on/off
  cacheTTL: 10000     // Cache lifetime in milliseconds
});
```

Cache is automatically invalidated on:
- Insert operations
- Update operations
- Delete operations

## 🔒 Reserved Fields

- `id` - Automatically generated, cannot be used in schema

## 📊 File Format

Collections are stored as CSV files:

```csv
id,username,email,age
a1b2c3d4e5f6,john_doe,john@example.com,28
f6e5d4c3b2a1,jane_smith,jane@example.com,32
```

## 🧪 Dependencies

snap4db has **no runtime dependencies**. It uses only Node.js built-ins:

- `fs` / `fs.promises` - File storage and atomic CSV reads/writes
- `crypto` - ID generation

## 🎯 Use Cases

- Rapid prototyping
- Local development
- Testing and mocking
- Small-scale applications
- Configuration storage
- Log management
- Educational projects

## ⚠️ Limitations

- Not suitable for large-scale production databases
- No transaction support
- No concurrent write protection
- Limited to single-machine deployment
- Performance degrades with very large datasets

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please feel free to submit issues and pull requests.
