const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

/**
 * Logger class for tracking all database operations
 */
class Logger {
    constructor(dbPath, options = {}) {
        this.enabled = options.enableLogging === true;
        this.logPath = path.join(dbPath, '.logs');
        this.requestLogFile = path.join(this.logPath, 'requests.log');
        this.responseLogFile = path.join(this.logPath, 'responses.log');
        
        if (this.enabled) {
            this._ensureLogDirectory();
        }
    }

    /**
     * Ensures log directory exists
     * @private
     */
    _ensureLogDirectory() {
        if (!fs.existsSync(this.logPath)) {
            fs.mkdirSync(this.logPath, { recursive: true });
        }
    }

    /**
     * Generates a unique 16-character log ID
     * @returns {string} Unique log identifier
     */
    generateLogId() {
        return crypto.randomBytes(8).toString('hex');
    }

    /**
     * Logs an incoming request
     * @param {string} method - Method name being called
     * @param {Object} params - Parameters passed to the method
     * @returns {string} Log ID for tracking
     */
    async logRequest(method, params = {}) {
        if (!this.enabled) return null;

        const logId = this.generateLogId();
        const timestamp = new Date().toISOString();
        
        const logEntry = {
            logId,
            timestamp,
            type: 'REQUEST',
            method,
            params: this._sanitizeParams(params),
            pid: process.pid,
            memory: process.memoryUsage(),
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        
        try {
            await fsPromises.appendFile(this.requestLogFile, logLine);
        } catch (error) {
            console.error('[Logger] Failed to write request log:', error.message);
        }

        return logId;
    }

    /**
     * Logs a response for a given request
     * @param {string} reqLogId - Request log ID to link to
     * @param {string} method - Method name that was called
     * @param {Object} result - Result or error from the operation
     * @param {boolean} success - Whether operation succeeded
     * @param {number} duration - Operation duration in milliseconds
     */
    async logResponse(reqLogId, method, result, success = true, duration = 0) {
        if (!this.enabled) return;

        const timestamp = new Date().toISOString();
        
        const logEntry = {
            reqLogId,
            timestamp,
            type: 'RESPONSE',
            method,
            success,
            duration: `${duration}ms`,
            result: success ? this._sanitizeResult(result) : null,
            error: success ? null : {
                name: result?.name,
                message: result?.message,
                code: result?.code,
                stack: result?.stack
            },
            pid: process.pid,
            memory: process.memoryUsage(),
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        
        try {
            await fsPromises.appendFile(this.responseLogFile, logLine);
        } catch (error) {
            console.error('[Logger] Failed to write response log:', error.message);
        }
    }

    /**
     * Sanitizes parameters to avoid logging sensitive data
     * @private
     */
    _sanitizeParams(params) {
        const sanitized = { ...params };
        
        // Redact potential sensitive fields
        const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'auth'];
        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
            // Check nested data object
            if (sanitized.data && typeof sanitized.data === 'object' && sanitized.data[field]) {
                sanitized.data = { ...sanitized.data, [field]: '[REDACTED]' };
            }
        }
        
        return sanitized;
    }

    /**
     * Sanitizes result data for logging
     * @private
     */
    _sanitizeResult(result) {
        if (result === null || result === undefined) return result;
        
        // Handle arrays (collection results)
        if (Array.isArray(result)) {
            return {
                type: 'array',
                count: result.length,
                sample: result.length > 0 ? result[0] : null
            };
        }
        
        // Handle objects
        if (typeof result === 'object') {
            const sanitized = { ...result };
            
            // Redact sensitive fields
            const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'auth'];
            for (const field of sensitiveFields) {
                if (sanitized[field]) {
                    sanitized[field] = '[REDACTED]';
                }
            }
            
            return sanitized;
        }
        
        return result;
    }

    /**
     * Wraps a method call with logging
     * @param {string} method - Method name
     * @param {Function} fn - Function to execute
     * @param {Object} params - Parameters for logging
     */
    async wrapWithLogging(method, fn, params = {}) {
        const logId = await this.logRequest(method, params);
        const startTime = Date.now();
        
        try {
            const result = await fn();
            const duration = Date.now() - startTime;
            await this.logResponse(logId, method, result, true, duration);
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            await this.logResponse(logId, method, error, false, duration);
            throw error;
        }
    }

    /**
     * Reads recent logs
     * @param {string} type - 'requests' or 'responses'
     * @param {number} limit - Number of recent entries to return
     */
    async getLogs(type = 'requests', limit = 100) {
        if (!this.enabled) return [];

        const logFile = type === 'requests' ? this.requestLogFile : this.responseLogFile;
        
        if (!fs.existsSync(logFile)) {
            return [];
        }

        try {
            const content = await fsPromises.readFile(logFile, 'utf8');
            const lines = content.trim().split('\n').filter(line => line);
            const logs = lines.slice(-limit).map(line => JSON.parse(line));
            return logs.reverse(); // Most recent first
        } catch (error) {
            console.error('[Logger] Failed to read logs:', error.message);
            return [];
        }
    }

    /**
     * Retrieves logs for a specific request ID
     * @param {string} logId - The 16-character request log ID
     * @returns {Promise<{request: object|null, response: object|null}>}
     */
    async getLogById(logId, type = 'both') {
        if (!this.enabled) return { request: null, response: null };

        const result = { request: null, response: null };

        // Find request entry (if requested)
        if ((type === 'both' || type === 'requests') && fs.existsSync(this.requestLogFile)) {
            try {
                const content = await fsPromises.readFile(this.requestLogFile, 'utf8');
                const lines = content.trim().split('\n').filter(Boolean);
                for (let i = lines.length - 1; i >= 0; i--) {
                    const entry = JSON.parse(lines[i]);
                    if (entry.logId === logId) {
                        result.request = entry;
                        break;
                    }
                }
            } catch (error) {
                console.error('[Logger] Failed to read requests for getLogById:', error.message);
            }
        }

        // Find response entry linked to this request (if requested)
        if ((type === 'both' || type === 'responses') && fs.existsSync(this.responseLogFile)) {
            try {
                const content = await fsPromises.readFile(this.responseLogFile, 'utf8');
                const lines = content.trim().split('\n').filter(Boolean);
                for (let i = lines.length - 1; i >= 0; i--) {
                    const entry = JSON.parse(lines[i]);
                    if (entry.reqLogId === logId) {
                        result.response = entry;
                        break;
                    }
                }
            } catch (error) {
                console.error('[Logger] Failed to read responses for getLogById:', error.message);
            }
        }

        return result;
    }

    /**
     * Clears all logs
     */
    async clearLogs() {
        if (!this.enabled) return;

        try {
            if (fs.existsSync(this.requestLogFile)) {
                await fsPromises.unlink(this.requestLogFile);
            }
            if (fs.existsSync(this.responseLogFile)) {
                await fsPromises.unlink(this.responseLogFile);
            }
        } catch (error) {
            console.error('[Logger] Failed to clear logs:', error.message);
        }
    }
}

module.exports = Logger;
