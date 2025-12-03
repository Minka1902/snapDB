/**
 * Simple EventEmitter for SnapDB hooks
 */
class EventEmitter {
    constructor() {
        this.events = new Map();
    }

    /**
     * Register an event listener
     * @param {string} event - Event name
     * @param {Function} listener - Listener function
     */
    on(event, listener) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(listener);
    }

    /**
     * Register a one-time event listener
     * @param {string} event - Event name
     * @param {Function} listener - Listener function
     */
    once(event, listener) {
        const onceWrapper = (...args) => {
            listener(...args);
            this.off(event, onceWrapper);
        };
        this.on(event, onceWrapper);
    }

    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {Function} listener - Listener function
     */
    off(event, listener) {
        if (!this.events.has(event)) return;

        const listeners = this.events.get(event);
        const index = listeners.indexOf(listener);

        if (index !== -1) {
            listeners.splice(index, 1);
        }

        if (listeners.length === 0) {
            this.events.delete(event);
        }
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to listeners
     */
    async emit(event, ...args) {
        if (!this.events.has(event)) return;

        const listeners = this.events.get(event);

        for (const listener of listeners) {
            try {
                await listener(...args);
            } catch (error) {
                console.error(`[EventEmitter] Error in listener for '${event}':`, error);
            }
        }
    }

    /**
     * Remove all listeners for an event or all events
     * @param {string} [event] - Event name (optional)
     */
    removeAllListeners(event) {
        if (event) {
            this.events.delete(event);
        } else {
            this.events.clear();
        }
    }

    /**
     * Get listener count for an event
     * @param {string} event - Event name
     * @returns {number} Number of listeners
     */
    listenerCount(event) {
        return this.events.has(event) ? this.events.get(event).length : 0;
    }
}

module.exports = EventEmitter;
