# Snap4DB
Snap4DB is a lightweight, file-based mock database built on top of the csv-for-you library. It stores collections as individual CSV files, making it ideal for quick prototyping, small-scale apps, and local development without requiring a full database setup.

📦 Installation
```bash
npm install snap4db
```

## 🛠️ Features
1) Create CSV-backed collections with custom schema
2) Generate unique 24-character IDs for each record
3) Insert, retrieve, and delete records by ID
4) Delete entire collections
5) Calculate total database size

## 📚 Usage
### Initialize Database
```js
const MockDB = require('snap4db');
const db = new SnapDB(); // defaults to "DATABASE" folder
```

### Create a Collection
```js
db.createCollection('users', ['name', 'email']);
```

### Insert a Record
```js
const result = await db.insert('users', {
  name: 'Alice',
  email: 'alice@example.com'
});

console.log(result.newRecordId);
```

### Retrieve a Collection
```js
const users = await db.getCollection('users');
console.log(users);
```

### Find Record by ID
```js
const someUser = await db.findById('unique_id', 'users');
const otherUser = await db.findById('other_id');
console.log(user);
```

### Delete Record by ID
```js
await db.deleteById('some_unique_id', 'users');
```

### Delete Collection
```js
await db.deleteCollectionByName('users');
```

### Get All Collection Names
```js
const collections = await db.getCollectionNames();
console.log(collections);
```

### Calculate Database Size
```js
const sizeInBytes = await db.calcDBSize();
console.log(`Database size: ${sizeInBytes} bytes`);
```

## 📁 File Structure
Each collection is saved as a .csv file inside the specified database folder. The default location is a DATABASE directory in your project root directory.

## ⚙️ Configuration Notes
The ID field is automatically generated and prepended to each record.
You cannot include id in your custom schema when creating a collection.
Records are stored as plain CSV with headers, one file per collection.

## 🧪 Dependencies
csv-for-you and crypto (Node.js core modules)

## Future Features
1. Adding the bug reporter
2. Adding an error handler
3. Creating the PUT method to the DB
