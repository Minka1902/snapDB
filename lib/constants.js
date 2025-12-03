const CONSTANTS = {
    ID_FIELD: 'id',
    ID_BYTE_LENGTH: 12,
    CSV_EXTENSION: '.csv',
    FILE_ENCODING: 'utf8',
    CACHE_TTL: 5000,
};

const PARSE_OPTIONS = {
    arraySeparator: ';',
    objectSeparator: ';',
    lineAsArray: false,
    fileAsArray: true,
    returnAsString: ['id'],
};

module.exports = {
    CONSTANTS,
    PARSE_OPTIONS
};
