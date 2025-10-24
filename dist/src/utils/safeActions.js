import { expect } from "@playwright/test";
import { createLogger, format, transports } from "winston";
/**
 * Custom error class for safe action failures
 */
export class SafeActionError extends Error {
    selector;
    attempt;
    cause;
    constructor(message, selector, attempt, cause) {
        super(message);
        this.selector = selector;
        this.attempt = attempt;
        this.cause = cause;
        this.name = 'SafeActionError';
        // Preserve stack trace
        Error.captureStackTrace(this, SafeActionError);
    }
}
// Configure logger
const logger = createLogger({
    format: format.combine(format.timestamp(), format.colorize(), format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level}]: ${message}`;
    })),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'error.log', level: 'error' }),
        new transports.File({ filename: 'actions.log' })
    ]
});
const DEFAULT_OPTIONS = {
    retries: 3,
    timeout: 5000,
    delay: 500,
    force: false,
    scroll: true,
    verbose: false,
    onError: null
};
/**
 * Safely retry an async function with configurable options
 * @param action The async function to retry
 * @param options Configuration options
 * @returns Result of the action
 */
async function withRetry(action, options, actionName, target) {
    const startTime = Date.now();
    let attempts = 0;
    for (let i = 0; i < options.retries; i++) {
        attempts++;
        try {
            if (options.verbose) {
                logger.info(`${actionName} attempt ${attempts}/${options.retries}`, { target });
            }
            const value = await action();
            const duration = Date.now() - startTime;
            logger.debug(`${actionName} succeeded`, {
                target,
                attempts,
                duration
            });
            return { success: true, value, attempts, duration };
        }
        catch (error) {
            const isLastAttempt = i === options.retries - 1;
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn(`${actionName} attempt ${attempts} failed: ${errorMessage}`, {
                target,
                attempts,
                isLastAttempt
            });
            if (options.onError) {
                await options.onError(error instanceof Error ? error : new Error(String(error)), attempts);
            }
            if (isLastAttempt) {
                const duration = Date.now() - startTime;
                const finalError = new SafeActionError(`${actionName} failed after ${attempts} attempts: ${errorMessage}`, target, attempts, error instanceof Error ? error : undefined);
                logger.error(`${actionName} failed permanently`, {
                    target,
                    attempts,
                    duration,
                    error: finalError
                });
                return {
                    success: false,
                    error: finalError,
                    attempts,
                    duration
                };
            }
            await new Promise(resolve => setTimeout(resolve, options.delay * Math.pow(2, i)));
        }
    }
    // This should never happen due to the loop structure
    throw new Error('Unexpected retry loop exit');
}
/**
 * Safely clicks an element with retry capability
 * @param page Playwright Page object
 * @param selector Element selector
 * @param options Configuration options
 * @returns Action result
 */
export async function clickSafe(page, selector, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    return withRetry(async () => {
        const element = page.locator(selector);
        // Verify element state before clicking
        if (!opts.force) {
            await expect(element).toBeVisible({ timeout: opts.timeout });
            await expect(element).toBeEnabled({ timeout: opts.timeout });
        }
        if (opts.scroll) {
            await element.scrollIntoViewIfNeeded();
        }
        await element.click({
            timeout: opts.timeout,
            force: opts.force
        });
    }, opts, 'Click', selector);
}
/**
 * Safely fills a form field with retry capability
 * @param page Playwright Page object
 * @param selector Element selector
 * @param text Text to fill
 * @param options Configuration options
 * @returns Action result
 */
export async function fillSafe(page, selector, text, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    return withRetry(async () => {
        const element = page.locator(selector);
        // Verify element state before filling
        if (!opts.force) {
            await expect(element).toBeVisible({ timeout: opts.timeout });
            await expect(element).toBeEnabled({ timeout: opts.timeout });
        }
        if (opts.scroll) {
            await element.scrollIntoViewIfNeeded();
        }
        await element.fill(text, { timeout: opts.timeout });
        // Verify the text was entered correctly
        const actualText = await element.inputValue();
        if (actualText !== text) {
            throw new SafeActionError(`Text verification failed. Expected: "${text}", Got: "${actualText}"`, selector);
        }
    }, opts, 'Fill', selector);
}
/**
 * Safely expects an element condition with retry capability
 * @param locator Playwright Locator object
 * @param assertion The assertion function to run
 * @param options Configuration options
 * @returns Action result
 */
export async function expectSafe(locator, assertion, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    return withRetry(async () => {
        if (opts.scroll) {
            await locator.scrollIntoViewIfNeeded();
        }
        return assertion(locator);
    }, opts, 'Expect', locator.toString());
}
/**
 * Safely waits for a network request with retry capability
 * @param page Playwright Page object
 * @param urlPattern URL pattern to wait for
 * @param options Configuration options
 * @returns Action result with the response
 */
export async function waitForRequestSafe(page, urlPattern, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    return withRetry(async () => page.waitForResponse(urlPattern, { timeout: opts.timeout }), opts, 'WaitForRequest', urlPattern.toString());
}
/**
 * Safely executes a custom action with retry capability
 * @param action The async action to perform
 * @param options Configuration options
 * @returns Action result
 */
export async function executeSafe(action, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    return withRetry(action, opts, 'CustomAction');
}
/**
 * Checks if an error is a SafeActionError
 */
export function isSafeActionError(error) {
    return error instanceof SafeActionError;
}
//# sourceMappingURL=safeActions.js.map