const DatabaseError = require('./DatabaseError');

/**
 * Error thrown when data in a collection file is corrupted or malformed
 */
class CorruptedDataError extends DatabaseError {
    constructor(collectionName, details = null) {
        super(
            `Data corrupted in collection "${collectionName}". ${details || 'File may be malformed.'}`,
            'CORRUPTED_DATA'
        );
        this.collectionName = collectionName;
        this.details = details;
    }
}

module.exports = CorruptedDataError;
