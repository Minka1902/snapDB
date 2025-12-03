const DatabaseError = require('./DatabaseError');

/**
 * Error thrown when file system operations fail
 */
class FileOperationError extends DatabaseError {
    constructor(operation, filePath, originalError) {
        super(
            `Failed to ${operation} file: ${filePath}. ${originalError.message}`,
            'FILE_OPERATION_ERROR'
        );
        this.operation = operation;
        this.filePath = filePath;
        this.originalError = originalError;
    }
}

module.exports = FileOperationError;
