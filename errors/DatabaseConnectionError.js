const DatabaseError = require('./DatabaseError');

/**
 * Error thrown when database connection/initialization fails
 */
class DatabaseConnectionError extends DatabaseError {
    constructor(dbPath, originalError = null) {
        super(
            `Failed to initialize database at path: ${dbPath}. ${originalError ? originalError.message : ''}`,
            'DATABASE_CONNECTION_ERROR'
        );
        this.dbPath = dbPath;
        this.originalError = originalError;
    }
}

module.exports = DatabaseConnectionError;
