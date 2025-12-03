/**
 * Central export for all SnapDB error classes
 */

const DatabaseError = require('./DatabaseError');
const CollectionNotFoundError = require('./CollectionNotFoundError');
const RecordNotFoundError = require('./RecordNotFoundError');
const CollectionAlreadyExistsError = require('./CollectionAlreadyExistsError');
const ReservedPropertyError = require('./ReservedPropertyError');
const EmptyCollectionError = require('./EmptyCollectionError');
const FileOperationError = require('./FileOperationError');
const ValidationError = require('./ValidationError');
const QueryError = require('./QueryError');
const DatabaseConnectionError = require('./DatabaseConnectionError');
const CorruptedDataError = require('./CorruptedDataError');

module.exports = {
    DatabaseError,
    CollectionNotFoundError,
    RecordNotFoundError,
    CollectionAlreadyExistsError,
    ReservedPropertyError,
    EmptyCollectionError,
    FileOperationError,
    ValidationError,
    QueryError,
    DatabaseConnectionError,
    CorruptedDataError
};
