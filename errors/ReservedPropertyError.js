const DatabaseError = require('./DatabaseError');

/**
 * Error thrown when trying to use a reserved property name
 */
class ReservedPropertyError extends DatabaseError {
    constructor(propertyName) {
        super(
            `Property "${propertyName}" is reserved and cannot be used in the schema.`,
            'RESERVED_PROPERTY'
        );
        this.propertyName = propertyName;
    }
}

module.exports = ReservedPropertyError;
