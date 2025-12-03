const DatabaseError = require('./DatabaseError');

/**
 * Error thrown when trying to create a collection that already exists
 */
class CollectionAlreadyExistsError extends DatabaseError {
    constructor(collectionName) {
        super(
            `Collection "${collectionName}" already exists.`,
            'COLLECTION_ALREADY_EXISTS'
        );
        this.collectionName = collectionName;
    }
}

module.exports = CollectionAlreadyExistsError;
