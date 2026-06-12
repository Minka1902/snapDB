/**
 * Query Builder class for advanced queries
 */
const fs = require('fs');
const csv = require('./csv');
const { QueryError } = require('../errors');
class QueryBuilder {
    constructor(db, collectionName) {
        this.db = db;
        this.collectionName = collectionName;
        this.filters = [];
        this.orFilters = [];
        this.sortField = null;
        this.sortOrder = 'asc';
        this.limitValue = null;
        this.offsetValue = 0;
    }

    /**
     * Add a filter condition (AND logic)
     * @param {string} field - Field name
     * @param {string} operator - Operator (=, !=, >, <, >=, <=, contains, !contains, in, !in, like, !like)
     * @param {*} value - Value to compare
     * @returns {QueryBuilder} This instance for chaining
     */
    where(field, operator, value) {
        this.filters.push({ field, operator, value });
        return this;
    }

    /**
     * Add an OR filter condition
     * @param {string} field - Field name
     * @param {string} operator - Operator (=, !=, >, <, >=, <=, contains, !contains, in, !in, like, !like)
     * @param {*} value - Value to compare
     * @returns {QueryBuilder} This instance for chaining
     */
    orWhere(field, operator, value) {
        this.orFilters.push({ field, operator, value });
        return this;
    }

    /**
     * Filter records where field is null, undefined, or empty string
     * @param {string} field - Field name
     * @returns {QueryBuilder} This instance for chaining
     */
    whereNull(field) {
        this.filters.push({ field, operator: 'null', value: null });
        return this;
    }

    /**
     * Filter records where field is NOT null, undefined, or empty string
     * @param {string} field - Field name
     * @returns {QueryBuilder} This instance for chaining
     */
    whereNotNull(field) {
        this.filters.push({ field, operator: '!null', value: null });
        return this;
    }

    /**
     * Filter records where date field is after a given date
     * @param {string} field - Field name (should contain date string or timestamp)
     * @param {Date|string} date - Date to compare
     * @returns {QueryBuilder} This instance for chaining
     */
    whereDate(field, operator, date) {
        const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
        this.filters.push({ field, operator: 'date', value: { operator, timestamp } });
        return this;
    }

    /**
     * Filter records where date field is between two dates
     * @param {string} field - Field name
     * @param {Date|string} startDate - Start date
     * @param {Date|string} endDate - End date
     * @returns {QueryBuilder} This instance for chaining
     */
    whereDateBetween(field, startDate, endDate) {
        const start = startDate instanceof Date ? startDate.getTime() : new Date(startDate).getTime();
        const end = endDate instanceof Date ? endDate.getTime() : new Date(endDate).getTime();
        this.filters.push({ field, operator: 'dateBetween', value: { start, end } });
        return this;
    }

    /**
     * Sort results
     * @param {string} field - Field to sort by
     * @param {string} order - Sort order ('asc' or 'desc')
     * @returns {QueryBuilder} This instance for chaining
     */
    orderBy(field, order = 'asc') {
        this.sortField = field;
        this.sortOrder = order;
        return this;
    }

    /**
     * Limit number of results
     * @param {number} count - Maximum number of results
     * @returns {QueryBuilder} This instance for chaining
     */
    limit(count) {
        this.limitValue = count;
        return this;
    }

    /**
     * Skip a number of results
     * @param {number} count - Number of results to skip
     * @returns {QueryBuilder} This instance for chaining
     */
    offset(count) {
        this.offsetValue = count;
        return this;
    }

    /**
     * Paginate results
     * @param {number} page - Page number (1-based)
     * @param {number} perPage - Results per page
     * @returns {QueryBuilder} This instance for chaining
     */
    paginate(page, perPage) {
        if (page < 1) {
            throw new QueryError('Page number must be >= 1', { page, perPage });
        }
        if (perPage < 1) {
            throw new QueryError('Per page count must be >= 1', { page, perPage });
        }
        this.offsetValue = (page - 1) * perPage;
        this.limitValue = perPage;
        return this;
    }

    /**
     * Check if a record matches a filter
     * @private
     */
    _matchesFilter(record, filter) {
        const fieldValue = record[filter.field];

        switch (filter.operator) {
            case '=':
                return fieldValue == filter.value;
            case '!=':
                return fieldValue != filter.value;
            case '>':
                return fieldValue > filter.value;
            case '<':
                return fieldValue < filter.value;
            case '>=':
                return fieldValue >= filter.value;
            case '<=':
                return fieldValue <= filter.value;
            case 'contains':
                return String(fieldValue).includes(filter.value);
            case '!contains':
                return !String(fieldValue).includes(filter.value);
            case 'in':
                return Array.isArray(filter.value) && filter.value.includes(fieldValue);
            case '!in':
                return Array.isArray(filter.value) && !filter.value.includes(fieldValue);
            case 'like':
                // SQL-like pattern matching: % for wildcard, _ for single char
                const pattern = String(filter.value)
                    .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') // Escape regex chars
                    .replace(/%/g, '.*')  // % = any characters
                    .replace(/_/g, '.');  // _ = single character
                const regex = new RegExp(`^${pattern}$`, 'i');
                return regex.test(String(fieldValue));
            case '!like':
                const notPattern = String(filter.value)
                    .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
                    .replace(/%/g, '.*')
                    .replace(/_/g, '.');
                const notRegex = new RegExp(`^${notPattern}$`, 'i');
                return !notRegex.test(String(fieldValue));
            case 'null':
                return fieldValue === null || fieldValue === undefined || fieldValue === '';
            case '!null':
                return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
            case 'date':
                // Compare dates
                const recordTimestamp = new Date(fieldValue).getTime();
                if (isNaN(recordTimestamp)) return false;
                
                switch (filter.value.operator) {
                    case '>':
                        return recordTimestamp > filter.value.timestamp;
                    case '<':
                        return recordTimestamp < filter.value.timestamp;
                    case '>=':
                        return recordTimestamp >= filter.value.timestamp;
                    case '<=':
                        return recordTimestamp <= filter.value.timestamp;
                    case '=':
                        // Compare dates by day (ignore time)
                        const recordDate = new Date(recordTimestamp).toDateString();
                        const filterDate = new Date(filter.value.timestamp).toDateString();
                        return recordDate === filterDate;
                    default:
                        return false;
                }
            case 'dateBetween':
                const betweenTimestamp = new Date(fieldValue).getTime();
                if (isNaN(betweenTimestamp)) return false;
                return betweenTimestamp >= filter.value.start && betweenTimestamp <= filter.value.end;
            default:
                throw new QueryError(`Unsupported operator '${filter.operator}'`, filter);
        }
    }

    /**
     * Check whether a record passes all AND filters and (if any) the OR filters.
     * @private
     */
    _passes(record) {
        for (const filter of this.filters) {
            if (!this._matchesFilter(record, filter)) return false;
        }
        if (this.orFilters.length > 0) {
            return this.orFilters.some(filter => this._matchesFilter(record, filter));
        }
        return true;
    }

    /**
     * Streams the collection's rows without buffering the whole file.
     * @private
     * @returns {AsyncGenerator<Object>}
     */
    async *_stream() {
        const filePath = this.db.getCollectionPath(this.collectionName);
        if (!fs.existsSync(filePath)) return;
        yield* csv.streamRows(filePath);
    }

    /**
     * Execute the query
     * @returns {Promise<Array<Object>>} Filtered results
     */
    async execute() {
        try {
            // No sorting: stream and stop early once the limit is reached so we
            // never read more of the file than necessary.
            if (!this.sortField) {
                const results = [];
                const offset = this.offsetValue > 0 ? this.offsetValue : 0;
                const limit = this.limitValue || null;
                let skipped = 0;

                for await (const record of this._stream()) {
                    if (!this._passes(record)) continue;
                    if (skipped < offset) { skipped++; continue; }
                    results.push(record);
                    if (limit && results.length >= limit) break;
                }
                return results;
            }

            // Sorting requires all matching records in memory.
            let records = [];
            for await (const record of this._stream()) {
                if (this._passes(record)) records.push(record);
            }

            records.sort((a, b) => {
                const aVal = a[this.sortField];
                const bVal = b[this.sortField];
                const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
                return this.sortOrder === 'desc' ? -comparison : comparison;
            });

            if (this.offsetValue > 0) {
                records = records.slice(this.offsetValue);
            }
            if (this.limitValue) {
                records = records.slice(0, this.limitValue);
            }

            return records;
        } catch (error) {
            if (error instanceof QueryError) throw error;
            throw new QueryError(error.message);
        }
    }

    /**
     * Get filtered records (applies filters, no sorting/limit/offset)
     * @private
     * @returns {Promise<Array<Object>>} Filtered records
     */
    async _getFilteredRecords() {
        const records = [];
        for await (const record of this._stream()) {
            if (this._passes(record)) records.push(record);
        }
        return records;
    }

    /**
     * Count records matching the query
     * @returns {Promise<number>} Count of matching records
     */
    async count() {
        try {
            const records = await this._getFilteredRecords();
            return records.length;
        } catch (error) {
            if (error instanceof QueryError) throw error;
            throw new QueryError(error.message);
        }
    }

    /**
     * Sum values of a field
     * @param {string} field - Field to sum
     * @returns {Promise<number>} Sum of field values
     */
    async sum(field) {
        try {
            const records = await this._getFilteredRecords();
            return records.reduce((sum, record) => {
                const value = parseFloat(record[field]);
                return sum + (isNaN(value) ? 0 : value);
            }, 0);
        } catch (error) {
            if (error instanceof QueryError) throw error;
            throw new QueryError(error.message);
        }
    }

    /**
     * Calculate average of a field
     * @param {string} field - Field to average
     * @returns {Promise<number>} Average of field values
     */
    async avg(field) {
        try {
            const records = await this._getFilteredRecords();
            if (records.length === 0) return 0;
            
            const sum = records.reduce((sum, record) => {
                const value = parseFloat(record[field]);
                return sum + (isNaN(value) ? 0 : value);
            }, 0);
            
            return sum / records.length;
        } catch (error) {
            if (error instanceof QueryError) throw error;
            throw new QueryError(error.message);
        }
    }

    /**
     * Find minimum value of a field
     * @param {string} field - Field to find minimum
     * @returns {Promise<number|null>} Minimum value or null if no records
     */
    async min(field) {
        try {
            const records = await this._getFilteredRecords();
            if (records.length === 0) return null;
            
            const values = records.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
            return values.length > 0 ? Math.min(...values) : null;
        } catch (error) {
            if (error instanceof QueryError) throw error;
            throw new QueryError(error.message);
        }
    }

    /**
     * Find maximum value of a field
     * @param {string} field - Field to find maximum
     * @returns {Promise<number|null>} Maximum value or null if no records
     */
    async max(field) {
        try {
            const records = await this._getFilteredRecords();
            if (records.length === 0) return null;
            
            const values = records.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
            return values.length > 0 ? Math.max(...values) : null;
        } catch (error) {
            if (error instanceof QueryError) throw error;
            throw new QueryError(error.message);
        }
    }
}

module.exports = QueryBuilder;
