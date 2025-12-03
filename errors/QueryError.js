const DatabaseError = require('./DatabaseError');

/**
 * Error thrown when a query operation fails
 */
class QueryError extends DatabaseError {
    constructor(message, query = null) {
        super(
            `Query error: ${message}`,
            'QUERY_ERROR'
        );
        this.query = query;
    }
}

module.exports = QueryError;
