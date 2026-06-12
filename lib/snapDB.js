const csv = require('./csv');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const QueryBuilder = require('./QueryBuilder');
const Logger = require('./Logger');
const EventEmitter = require('./EventEmitter');
const { CONSTANTS, PARSE_OPTIONS } = require('./constants');
const {
    CollectionNotFoundError,
    RecordNotFoundError,
    ReservedPropertyError,
    EmptyCollectionError,
    FileOperationError,
    DatabaseConnectionError,
    CollectionAlreadyExistsError,
    CorruptedDataError,
    ValidationError,
} = require('../errors');

/**
 * SnapDB - A lightweight CSV-based database
 * @class
 */
class SnapDB {
    /**
     * Creates a new SnapDB instance
     * @param {string} dbName - Name of the database directory
     * @param {Object} options - Configuration options
     * @param {number} options.cacheTTL - Cache time-to-live in milliseconds
     * @param {boolean} options.enableCache - Enable/disable caching
        * @param {boolean} options.enableLogging - Enable/disable request/response logging
     */
    constructor(dbName = 'DATABASE', options = {}) {
        try {
            this.dbPath = path.join(process.cwd(), dbName);
            this._ensureDbDirectory();

            // Caching system for efficiency
            this._enableCache = options.enableCache !== false;
            this._cacheTTL = options.cacheTTL || CONSTANTS.CACHE_TTL;
            this._headerCache = new Map();
            this._collectionCache = new Map();
            
            // Logger for tracking requests/responses
            this.logger = new Logger(this.dbPath, { enableLogging: options.enableLogging });

            // Event system for hooks
            this.events = new EventEmitter();
        } catch (error) {
            throw new DatabaseConnectionError(this.dbPath || dbName, error);
        }
    }

    /**
     * Ensures database directory exists
     * @private
     */
    _ensureDbDirectory() {
        if (!fs.existsSync(this.dbPath)) {
            fs.mkdirSync(this.dbPath, { recursive: true });
        }
    }

    /**
     * Generates a unique 24-character ID
     * @returns {string} Unique identifier
     */
    generateId() {
        return crypto.randomBytes(CONSTANTS.ID_BYTE_LENGTH).toString('hex');
    }

    /**
     * Clears cache for a specific collection
     * @private
     * @param {string} collectionName - Name of the collection
     */
    _clearCache(collectionName) {
        if (!this._enableCache) return;

        const filePath = this.getCollectionPath(collectionName);
        this._headerCache.delete(filePath);
        this._collectionCache.delete(collectionName);
    }

    /**
     * Creates a new collection
     * @param {string} collectionName - Name of the collection
     * @param {Array<string>} properties - Column names
     * @returns {Promise<boolean>} Success status
     */
    async createCollection(collectionName, properties = []) {
        return this.logger.wrapWithLogging('createCollection', async () => {
            const filePath = this.getCollectionPath(collectionName);

            if (properties.includes(CONSTANTS.ID_FIELD)) {
                throw new ReservedPropertyError(CONSTANTS.ID_FIELD);
            }

            if (fs.existsSync(filePath)) {
                throw new CollectionAlreadyExistsError(collectionName);
            }

            try {
                const headers = [CONSTANTS.ID_FIELD, ...properties].join(',');
                await fsPromises.writeFile(filePath, `${headers}\n`);
                return true;
            } catch (error) {
                throw new FileOperationError('create', filePath, error);
            }
        }, { collectionName, properties });
    }

    /**
     * Gets the file path for a collection
     * @param {string} collectionName - Name of the collection
     * @returns {string} Full file path
     */
    getCollectionPath(collectionName) {
        return path.join(this.dbPath, `${collectionName}${CONSTANTS.CSV_EXTENSION}`);
    }

    /**
     * Checks if a collection exists
     * @param {string} collectionName - Name of the collection
     * @returns {boolean} True if collection exists
     */
    collectionExists(collectionName) {
        const filePath = this.getCollectionPath(collectionName);
        return fs.existsSync(filePath);
    }

    /**
     * Inserts a new record into a collection
     * @param {string} collectionName - Name of the collection
     * @param {Object} data - Data to insert
     * @returns {Promise<Object>} Result with new record ID
     */
    async insert(collectionName, data) {
        return this.logger.wrapWithLogging('insert', async () => {
            await this.events.emit('beforeInsert', { collectionName, data });

            const filePath = this.getCollectionPath(collectionName);

            if (!fs.existsSync(filePath)) {
                throw new CollectionNotFoundError(collectionName);
            }

            try {
                const headers = await this.getHeaders(filePath);
                const filteredData = Object.fromEntries(
                    headers.map(key => [key, data[key] ?? ''])
                );

                filteredData.id = this.generateId();
                await csv.appendRow(filePath, filteredData, headers);

                this._clearCache(collectionName);

                const result = { message: 'Record created.', newRecordId: filteredData.id };
                await this.events.emit('afterInsert', { collectionName, data: filteredData, result });
                
                return result;
            } catch (error) {
                await this.events.emit('insertError', { collectionName, data, error });
                throw new FileOperationError('write to', filePath, error);
            }
        }, { collectionName, data });
    }

    /**
     * Inserts multiple records into a collection
     * @param {string} collectionName - Name of the collection
     * @param {Array<Object>} dataArray - Array of data objects to insert
     * @returns {Promise<Object>} Result with array of new record IDs
     */
    async insertMany(collectionName, dataArray) {
        return this.logger.wrapWithLogging('insertMany', async () => {
            if (!Array.isArray(dataArray)) {
                throw new ValidationError('dataArray', 'Must be an array', dataArray);
            }

            if (dataArray.length === 0) {
                return { message: 'No records to insert.', newRecordIds: [] };
            }

            const filePath = this.getCollectionPath(collectionName);

            if (!fs.existsSync(filePath)) {
                throw new CollectionNotFoundError(collectionName);
            }

            try {
                const headers = await this.getHeaders(filePath);
                const newRecordIds = [];
                const rows = [];

                for (const data of dataArray) {
                    const filteredData = Object.fromEntries(
                        headers.map(key => [key, data[key] ?? ''])
                    );

                    filteredData.id = this.generateId();
                    rows.push(filteredData);
                    newRecordIds.push(filteredData.id);
                }

                await csv.appendRows(filePath, rows, headers);

                this._clearCache(collectionName);
                return { 
                    message: `${newRecordIds.length} records created.`, 
                    newRecordIds,
                    count: newRecordIds.length
                };
            } catch (error) {
                throw new FileOperationError('write to', filePath, error);
            }
        }, { collectionName, count: dataArray.length });
    }

    /**
     * Gets column headers from a collection file (with caching)
     * @private
     * @param {string} filePath - Path to the collection file
     * @returns {Promise<Array<string>>} Array of header names
     */
    async getHeaders(filePath) {
        // Check cache first for efficiency
        if (this._enableCache && this._headerCache.has(filePath)) {
            return this._headerCache.get(filePath);
        }

        try {
            const fileData = await fsPromises.readFile(filePath, CONSTANTS.FILE_ENCODING);

            if (!fileData || fileData.length === 0) {
                const collectionName = path.basename(filePath, CONSTANTS.CSV_EXTENSION);
                throw new CorruptedDataError(collectionName, 'Header line is missing or file is empty');
            }

            const headers = fileData.split('\n')[0].split(',').map(h => h.trim());

            // Cache headers for efficiency
            if (this._enableCache) {
                this._headerCache.set(filePath, headers);
            }

            return headers;
        } catch (error) {
            if (error instanceof CorruptedDataError) throw error;
            throw new FileOperationError('read', filePath, error);
        }
    }

    /**
     * Gets all collection names in the database
     * @returns {Promise<Array<string>>} Array of collection names
     */
    async getCollectionNames() {
        try {
            const files = await fsPromises.readdir(this.dbPath);
            const collections = files
                .filter(file => file.endsWith(CONSTANTS.CSV_EXTENSION))
                .map(file => file.replace(CONSTANTS.CSV_EXTENSION, ''));

            if (collections.length === 0) {
                throw new EmptyCollectionError();
            }

            return collections;
        } catch (error) {
            if (error instanceof EmptyCollectionError) throw error;
            throw new FileOperationError('read directory', this.dbPath, error);
        }
    }

    /**
     * Gets all records from a collection
     * @param {string} collectionName - Name of the collection
     * @returns {Promise<Array<Object>>} Array of records
     */
    async getCollection(collectionName) {
        return this.logger.wrapWithLogging('getCollection', async () => {
            const filePath = this.getCollectionPath(collectionName);

            if (!fs.existsSync(filePath)) {
                return [];
            }

            // Check cache first for efficiency
            if (this._enableCache && this._collectionCache.has(collectionName)) {
                const cached = this._collectionCache.get(collectionName);
                if (Date.now() - cached.timestamp < this._cacheTTL) {
                    return cached.data;
                }
            }

            let data;
            try {
                data = await csv.parse(filePath);
            } catch (error) {
                throw new CorruptedDataError(collectionName, error.message);
            }

            // Cache the result with timestamp
            if (this._enableCache) {
                this._collectionCache.set(collectionName, {
                    data,
                    timestamp: Date.now()
                });
            }

            return data;
        }, { collectionName });
    }

    /**
     * Finds a record by ID
     * @param {string} id - Record ID to find
     * @param {string} [collectionName=''] - Optional collection name to search in
     * @returns {Promise<Object>} Found record
     */
    async findById(id, collectionName = '') {
        return this.logger.wrapWithLogging('findById', async () => {
        if (collectionName) {
            let records;
            try {
                records = await csv.parse(
                    this.getCollectionPath(collectionName),
                    PARSE_OPTIONS
                );
            } catch (error) {
                throw new CorruptedDataError(collectionName, error.message);
            }
            const requestedItem = records.find(record => record.id === id);

            if (!requestedItem) {
                throw new RecordNotFoundError(id, collectionName);
            }

            return requestedItem;
        }

        // Search across all collections
        const collections = await this.getCollectionNames();

        for (const collection of collections) {
            let records;
            try {
                records = await csv.parse(
                    this.getCollectionPath(collection),
                    PARSE_OPTIONS
                );
            } catch (error) {
                throw new CorruptedDataError(collection, error.message);
            }
            const requestedItem = records.find(record => record.id === id);

            if (requestedItem) {
                return { ...requestedItem, _collection: collection };
            }
        }

        throw new RecordNotFoundError(id);
        }, { id, collectionName });
    }

    /**
     * Deletes a record by ID
     * @param {string} id - Record ID to delete
     * @param {string} [collectionName=''] - Optional collection name
     * @returns {Promise<Object>} Deletion result
     */
    async deleteById(id, collectionName = '') {
        return this.logger.wrapWithLogging('deleteById', async () => {
            await this.events.emit('beforeDelete', { id, collectionName });

            try {
                if (collectionName) {
                    const collectionPath = this.getCollectionPath(collectionName);

                    let removed;
                    try {
                        removed = await csv.deleteByField(collectionPath, CONSTANTS.ID_FIELD, id);
                    } catch (error) {
                        throw new FileOperationError('delete row(s) from', collectionPath, error);
                    }

                    if (removed === 0) {
                        throw new RecordNotFoundError(id, collectionName);
                    }

                    this._clearCache(collectionName);
                    const result = {
                        message: `Item was successfully deleted from collection '${collectionName}'`,
                        itemId: id
                    };

                    await this.events.emit('afterDelete', { id, collectionName, result });
                    return result;
                }

                // Search and delete across all collections
                const collections = await this.getCollectionNames();

                for (const collection of collections) {
                    const collectionPath = this.getCollectionPath(collection);

                    let removed;
                    try {
                        removed = await csv.deleteByField(collectionPath, CONSTANTS.ID_FIELD, id);
                    } catch (error) {
                        throw new FileOperationError('delete row(s) from', collectionPath, error);
                    }

                    if (removed > 0) {
                        this._clearCache(collection);
                        const result = {
                            message: `Item was successfully deleted from collection '${collection}'`,
                            itemId: id,
                            collection
                        };

                        await this.events.emit('afterDelete', { id, collectionName: collection, result });
                        return result;
                    }
                }

                throw new RecordNotFoundError(id);
            } catch (error) {
                await this.events.emit('deleteError', { id, collectionName, error });
                throw error;
            }
        }, { id, collectionName });
    }

    /**
     * Deletes multiple records by IDs
     * @param {Array<string>} ids - Array of record IDs to delete
     * @param {string} [collectionName=''] - Optional collection name
     * @returns {Promise<Object>} Deletion result with count
     */
    async deleteMany(ids, collectionName = '') {
        return this.logger.wrapWithLogging('deleteMany', async () => {
            if (!Array.isArray(ids)) {
                throw new ValidationError('ids', 'Must be an array', ids);
            }

            if (ids.length === 0) {
                return { message: 'No records to delete.', deletedIds: [], count: 0 };
            }

            const deletedIds = [];
            const notFoundIds = [];

            for (const id of ids) {
                try {
                    await this.deleteById(id, collectionName);
                    deletedIds.push(id);
                } catch (error) {
                    if (error instanceof RecordNotFoundError) {
                        notFoundIds.push(id);
                    } else {
                        throw error;
                    }
                }
            }

            return {
                message: `${deletedIds.length} record(s) deleted.`,
                deletedIds,
                notFoundIds,
                count: deletedIds.length
            };
        }, { idsCount: ids.length, collectionName });
    }
    
    

    /**
     * Deletes an entire collection
     * @param {string} collectionName - Name of the collection to delete
     * @returns {Promise<boolean>} Success status
     */
    async deleteCollectionByName(collectionName) {
        const filePath = this.getCollectionPath(collectionName);

        if (!fs.existsSync(filePath)) {
            return false;
        }

        try {
            await fsPromises.unlink(filePath);
            this._clearCache(collectionName);
            return true;
        } catch (error) {
            throw new FileOperationError('delete', filePath, error);
        }
    }

    /**
     * Calculates total database size
     * @returns {Promise<number>} Total size in bytes
     */
    async calcDBSize() {
        const collections = await this.getCollectionNames();
        let totalSize = 0;

        for (const collection of collections) {
            const filePath = this.getCollectionPath(collection);
            try {
                const stats = await fsPromises.stat(filePath);
                totalSize += stats.size;
            } catch (error) {
                throw new FileOperationError('stat', filePath, error);
            }
        }

        return totalSize;
    }

    /**
     * Exports database or specific collections to JSON
     * @param {string} [collectionName=''] - Optional collection name (exports all if omitted)
     * @returns {Promise<Object>} Backup data with metadata
     */
    async exportData(collectionName = '') {
        return this.logger.wrapWithLogging('exportData', async () => {
            const backup = {
                timestamp: new Date().toISOString(),
                dbName: path.basename(this.dbPath),
                collections: {}
            };

            if (collectionName) {
                // Export single collection
                if (!fs.existsSync(this.getCollectionPath(collectionName))) {
                    throw new CollectionNotFoundError(collectionName);
                }
                const headers = await this.getHeaders(this.getCollectionPath(collectionName));
                const records = await this.getCollection(collectionName);
                backup.collections[collectionName] = { headers, records };
            } else {
                // Export all collections
                const collections = await this.getCollectionNames();
                for (const collection of collections) {
                    const headers = await this.getHeaders(this.getCollectionPath(collection));
                    const records = await this.getCollection(collection);
                    backup.collections[collection] = { headers, records };
                }
            }

            return backup;
        }, { collectionName: collectionName || 'all' });
    }

    /**
     * Imports data from backup
     * @param {Object} backupData - Backup data from exportData
     * @param {Object} options - Import options
     * @param {boolean} options.overwrite - Overwrite existing collections (default: false)
     * @returns {Promise<Object>} Import result
     */
    async importData(backupData, options = {}) {
        return this.logger.wrapWithLogging('importData', async () => {
            if (!backupData || !backupData.collections) {
                throw new ValidationError('backupData', 'Invalid backup data format', backupData);
            }

            const overwrite = options.overwrite !== false;
            const imported = [];
            const skipped = [];
            const errors = [];

            for (const [collectionName, data] of Object.entries(backupData.collections)) {
                try {
                    const filePath = this.getCollectionPath(collectionName);
                    const exists = fs.existsSync(filePath);

                    if (exists && !overwrite) {
                        skipped.push(collectionName);
                        continue;
                    }

                    // Create or overwrite collection
                    if (exists) {
                        await fsPromises.unlink(filePath);
                    }

                    const properties = data.headers.filter(h => h !== 'id');
                    await this.createCollection(collectionName, properties);

                    // Import records
                    if (data.records && data.records.length > 0) {
                        await this.insertMany(collectionName, data.records);
                    }

                    imported.push(collectionName);
                } catch (error) {
                    errors.push({ collection: collectionName, error: error.message });
                }
            }

            return {
                message: `Import complete. ${imported.length} collection(s) imported.`,
                imported,
                skipped,
                errors
            };
        }, { collectionsCount: Object.keys(backupData.collections || {}).length });
    }

    /**
     * Saves backup to a JSON file
     * @param {string} backupPath - Path to save backup file
     * @param {string} [collectionName=''] - Optional collection name
     * @returns {Promise<Object>} Backup result with file path
     */
    async backup(backupPath, collectionName = '') {
        return this.logger.wrapWithLogging('backup', async () => {
            const backupData = await this.exportData(collectionName);
            
            try {
                await fsPromises.writeFile(
                    backupPath,
                    JSON.stringify(backupData, null, 2),
                    'utf8'
                );

                return {
                    message: 'Backup created successfully.',
                    backupPath,
                    timestamp: backupData.timestamp,
                    collections: Object.keys(backupData.collections)
                };
            } catch (error) {
                throw new FileOperationError('write', backupPath, error);
            }
        }, { backupPath, collectionName: collectionName || 'all' });
    }

    /**
     * Restores database from a backup file
     * @param {string} backupPath - Path to backup file
     * @param {Object} options - Restore options
     * @param {boolean} options.overwrite - Overwrite existing collections (default: false)
     * @returns {Promise<Object>} Restore result
     */
    async restore(backupPath, options = {}) {
        return this.logger.wrapWithLogging('restore', async () => {
            if (!fs.existsSync(backupPath)) {
                throw new FileOperationError('read', backupPath, new Error('Backup file not found'));
            }

            try {
                const backupContent = await fsPromises.readFile(backupPath, 'utf8');
                const backupData = JSON.parse(backupContent);

                return await this.importData(backupData, options);
            } catch (error) {
                if (error instanceof ValidationError) throw error;
                throw new FileOperationError('read or parse', backupPath, error);
            }
        }, { backupPath, overwrite: options.overwrite });
    }

    /**
     * Query builder for advanced filtering
     * @param {string} collectionName - Collection to query
     * @returns {QueryBuilder} Query builder instance
     */
    query(collectionName) {
        return new QueryBuilder(this, collectionName);
    }

    /**
     * Updates a record by ID
     * @param {string} id - Record ID to update
     * @param {Object} updates - Fields to update
     * @param {string} [collectionName=''] - Optional collection name
     * @returns {Promise<Object>} Update result
     */
    async updateById(id, updates, collectionName = '') {
        return this.logger.wrapWithLogging('updateById', async () => {
        await this.events.emit('beforeUpdate', { id, updates, collectionName });

        const record = await this.findById(id, collectionName);
        const targetCollection = collectionName || record._collection;

        if (!targetCollection) {
            throw new ValidationError('collectionName', 'Collection name required when updating records found across collections');
        }

        try {
            const filePath = this.getCollectionPath(targetCollection);
            const headers = await this.getHeaders(filePath);

            const merged = { ...record, ...updates };
            delete merged._collection;
            const newId = this.generateId();
            const newRow = Object.fromEntries(
                headers.map(key => [key, key === CONSTANTS.ID_FIELD ? newId : (merged[key] ?? '')])
            );

            // Atomic in-place replacement (no delete-then-insert data-loss window)
            const replaced = await csv.updateByField(filePath, CONSTANTS.ID_FIELD, id, newRow, headers);
            if (!replaced) {
                throw new RecordNotFoundError(id, targetCollection);
            }

            this._clearCache(targetCollection);
            const finalResult = { message: 'Record updated successfully', newRecordId: newId };

            await this.events.emit('afterUpdate', { id, updates, collectionName: targetCollection, result: finalResult });

            return finalResult;
        } catch (error) {
            await this.events.emit('updateError', { id, updates, collectionName, error });
            throw error;
        }
        }, { id, updates, collectionName });
    }

    /**
     * Updates multiple records by IDs
     * @param {Array<Object>} updateArray - Array of {id, updates, collectionName?} objects
     * @returns {Promise<Object>} Update result with counts
     */
    async updateMany(updateArray) {
        return this.logger.wrapWithLogging('updateMany', async () => {
            if (!Array.isArray(updateArray)) {
                throw new ValidationError('updateArray', 'Must be an array', updateArray);
            }

            if (updateArray.length === 0) {
                return { message: 'No records to update.', updatedIds: [], count: 0 };
            }

            const updatedIds = [];
            const failedIds = [];

            for (const item of updateArray) {
                if (!item.id || !item.updates) {
                    throw new ValidationError('updateArray item', 'Each item must have "id" and "updates" properties', item);
                }

                try {
                    await this.updateById(item.id, item.updates, item.collectionName || '');
                    updatedIds.push(item.id);
                } catch (error) {
                    if (error instanceof RecordNotFoundError) {
                        failedIds.push({ id: item.id, reason: 'Not found' });
                    } else {
                        throw error;
                    }
                }
            }

            return {
                message: `${updatedIds.length} record(s) updated.`,
                updatedIds,
                failedIds,
                count: updatedIds.length
            };
        }, { updateCount: updateArray.length });
    }

    /**
     * Clears all caches
     */
    clearAllCaches() {
        this._headerCache.clear();
        this._collectionCache.clear();
    }

    /**
     * Gets recent logs
     * @param {string} type - 'requests' or 'responses'
     * @param {number} limit - Number of entries to return
     * @returns {Promise<Array>} Log entries
     */
    async getLogs(type = 'requests', limit = 100) {
        return this.logger.getLogs(type, limit);
    }

    /**
     * Clears all logs
     */
    async clearLogs() {
        return this.logger.clearLogs();
    }

    /**
     * Get a specific request/response log pair by request log ID
     * @param {string} logId - 16-character request log ID
     * @param {string} type - Type of logs to retrieve
     * @returns {Promise<{request: object|null, response: object|null}>}
     */
    async getLogById(logId, type = 'both') {
        return this.logger.getLogById(logId, type);
    }

    /**
     * Register a hook/event listener
     * @param {string} event - Event name (beforeInsert, afterInsert, beforeUpdate, afterUpdate, beforeDelete, afterDelete, etc.)
     * @param {Function} listener - Listener function
     */
    on(event, listener) {
        this.events.on(event, listener);
    }

    /**
     * Register a one-time hook/event listener
     * @param {string} event - Event name
     * @param {Function} listener - Listener function
     */
    once(event, listener) {
        this.events.once(event, listener);
    }

    /**
     * Remove a hook/event listener
     * @param {string} event - Event name
     * @param {Function} listener - Listener function
     */
    off(event, listener) {
        this.events.off(event, listener);
    }

    /**
     * Remove all hooks/event listeners for an event
     * @param {string} [event] - Event name (optional, removes all if omitted)
     */
    removeAllListeners(event) {
        this.events.removeAllListeners(event);
    }
}

module.exports = SnapDB;
