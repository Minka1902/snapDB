const DatabaseError = require('./DatabaseError');

/**
 * Error thrown when no collections exist in the database
 */
class EmptyCollectionError extends DatabaseError {
    constructor() {
        super(
            'No collections found in the database.',
            'NO_COLLECTIONS'
        );
    }
}

module.exports = EmptyCollectionError;
