const DatabaseError = require('./DatabaseError');

/**
 * Error thrown when a record with the specified ID cannot be found
 */
class RecordNotFoundError extends DatabaseError {
    constructor(recordId, collectionName = null) {
        const message = collectionName
            ? `Record with ID "${recordId}" not found in collection "${collectionName}".`
            : `Record with ID "${recordId}" not found in any collection.`;
        
        super(message, 'RECORD_NOT_FOUND');
        this.recordId = recordId;
        this.collectionName = collectionName;
    }
}

module.exports = RecordNotFoundError;
