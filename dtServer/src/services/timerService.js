'use strict';

/**
 * Server-authoritative countdown timer.
 */
class TimerService {
    constructor() {
        this._handle = null;
        this._endTime = null;
        this._remaining = 0;
    }

    /**
     * Start a countdown timer.
     * @param {number} durationMs - Total duration in milliseconds
     * @param {function} onTick   - Called every second with remaining ms
     * @param {function} onComplete - Called when timer reaches 0
     */
    start(durationMs, onTick, onComplete) {
        this.stop(); // cancel any existing timer
        this._endTime = Date.now() + durationMs;
        this._remaining = durationMs;

        this._handle = setInterval(() => {
            this._remaining = Math.max(0, this._endTime - Date.now());
            if (typeof onTick === 'function') onTick(this._remaining);

            if (this._remaining <= 0) {
                this.stop();
                if (typeof onComplete === 'function') onComplete();
            }
        }, 1000);
    }

    stop() {
        if (this._handle) {
            clearInterval(this._handle);
            this._handle = null;
        }
    }

    /** Get remaining ms (useful for reconnect state sync). */
    getRemaining() {
        if (!this._endTime) return 0;
        return Math.max(0, this._endTime - Date.now());
    }

    /** Get the absolute epoch ms when this timer ends. */
    getEndTime() {
        return this._endTime;
    }
}

module.exports = TimerService;
