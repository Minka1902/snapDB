const DatabaseError = require('./DatabaseError');

/**
 * Error thrown when data validation fails
 */
class ValidationError extends DatabaseError {
    constructor(field, message, value = null) {
        super(
            `Validation failed for field "${field}": ${message}`,
            'VALIDATION_ERROR'
        );
        this.field = field;
        this.value = value;
        this.validationMessage = message;
    }
}

module.exports = ValidationError;
