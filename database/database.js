const csv = require('csv-for-you')
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const parseOptions = {
    arraySeparator: ';',
    objectSeparator: ';',
    lineAsArray: false,
    fileAsArray: true,
    returnAsString: ['id'],
};

class MockDB {
    constructor(dbName = "DATABASE") {
        this.dbPath = path.join(process.cwd(), dbName);
        if (!fs.existsSync(this.dbPath)) {
            fs.mkdirSync(this.dbPath, { recursive: true });
        }
    }

    generateId() {
        return crypto.randomBytes(12).toString("hex"); // 24-character unique ID
    }

    async createCollection(collectionName, properties = []) {
        const filePath = this.getCollectionPath(collectionName);
        if (properties.indexOf('id') !== -1) return false;
        if (!fs.existsSync(filePath)) {
            let props = 'id';
            for (const prop of properties) {
                props += `,${prop}`;
            }
            fs.writeFileSync(filePath, `${props}\n`);
        }
        return true;
    }

    getCollectionPath(collectionName) {
        return path.join(this.dbPath, `${collectionName}.csv`);
    }

    async insert(collectionName, data) {
        const filePath = this.getCollectionPath(collectionName);

        if (!fs.existsSync(filePath)) throw new Error(`Collection "${collectionName}" does not exist.`);

        const headers = await this.getHeaders(filePath);

        const filteredData = Object.fromEntries(
            headers.map(key => [key, data[key] ?? ""])
        );

        filteredData.id = this.generateId();

        await csv.addRow(filePath, filteredData);
        return { message: 'File created.', newRecordId: filteredData.id };
    }

    async getHeaders(filePath) {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, 'utf8', (err, fileData) => {
                if (err) {
                    reject(err);
                }

                if (fileData.length > 0) {
                    const headers = fileData.split('\n')[0].split(',');
                    resolve(headers);
                }
            });
        })
    }

    async getCollectionNames() {
        return new Promise(async (resolve, reject) => {
            const asd = await fs.readdirSync(this.dbPath);
            if (asd.length > 0) {
                const collections = asd.filter(file => file.endsWith(".csv"))
                    .map(file => file.replace(".csv", ""));
                if (collections.length > 0) resolve(collections);
                else reject('No collections found');
            }
        });
    }

    async getCollection(collectionName) {
        const filePath = this.getCollectionPath(collectionName);
        if (!fs.existsSync(filePath)) return [];
        const data = await csv.parse(filePath, { lineAsArray: false });
        return data;
    }

    async findById(id, collectionName = '') {
        if (collectionName !== '') {
            return new Promise(async (resolve, reject) => {
                const records = await csv.parse(this.getCollectionPath(collectionName), parseOptions);
                const requestedItem = records.find(record => record.id === id)
                if (requestedItem) resolve(requestedItem);
                else reject('No such record');
            });
        } else {
            const collections = await this.getCollectionNames();
            for (const collection of collections) {
                const records = await csv.parse(this.getCollectionPath(collection), parseOptions);
                const requestedItem = records.find(record => record.id === id)
                if (requestedItem) return requestedItem;
                else return 'No such record';
            }
        }
    }

    async deleteById(id, collectionName = '') {
        if (collectionName !== '') {
            return new Promise(async (resolve, reject) => {
                const filePath = this.getCollectionPath(collectionName);
                const records = await csv.parse(filePath, parseOptions);
                const requestedItemIndex = records.findIndex((record) => record.id === id)
                const response = requestedItemIndex !== -1 && await csv.deleteRows(filePath, { rowNumber: requestedItemIndex + 1 })
                if (response?.success) resolve(requestedItem);
                else reject('No such record');
            });
        } else {
            return new Promise(async (resolve, reject) => {
                const collections = await this.getCollectionNames();
                for (const collection of collections) {
                    const collectionPath = this.getCollectionPath(collection);
                    const records = await csv.parse(collectionPath, parseOptions);
                    const requestedItem = records.findIndex(obj => obj.id === id)
                    if (requestedItem !== -1 && requestedItem !== 0) {
                        csv.deleteRows(collectionPath, { rowNumber: requestedItem + 1, rowsToDelete: 1 });
                        resolve(`Item with this <${id}> ID was successfully deleted`)
                    }
                    else reject('No such record');
                }
            });
        }
    }

    async deleteCollectionByName(collectionName) {
        const filePath = this.getCollectionPath(collectionName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    }

    async calcDBSize() {
        const files = await this.getCollectionNames();
        let totalSize = 0;
        for (const file of files) {
            const stats = fs.statSync(this.getCollectionPath(file));
            totalSize += stats.size;
        }
        return totalSize; // in bytes
    }
}

module.exports = MockDB;
