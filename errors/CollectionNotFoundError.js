const DatabaseError = require('./DatabaseError');

/**
 * Error thrown when a collection does not exist
 */
class CollectionNotFoundError extends DatabaseError {
    constructor(collectionName) {
        super(
            `Collection "${collectionName}" does not exist.`,
            'COLLECTION_NOT_FOUND'
        );
        this.collectionName = collectionName;
    }
}

module.exports = CollectionNotFoundError;
