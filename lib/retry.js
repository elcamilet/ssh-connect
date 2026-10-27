'use strict';

function shouldRetry(exitCode, attempt, retry) {
    if (!retry || retry.enabled !== true) {
        return false;
    }
    if (exitCode !== 255) {
        return false;
    }
    return attempt < retry.maxAttempts;
}

function retryDelayMs(retry) {
    const seconds = Number(retry && retry.delaySeconds);
    const safeSeconds = Number.isFinite(seconds) ? Math.min(300, Math.max(1, seconds)) : 5;
    return safeSeconds * 1000;
}

module.exports = {
    shouldRetry,
    retryDelayMs
};
