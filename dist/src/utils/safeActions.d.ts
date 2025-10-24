import { type Page, type Locator, type Response } from "@playwright/test";
/**
 * Configuration options for safe actions
 */
export interface SafeActionOptions {
    /** Number of retry attempts (default: 3) */
    retries?: number;
    /** Timeout in milliseconds for each attempt (default: 5000) */
    timeout?: number;
    /** Delay between retries in milliseconds (default: 500) */
    delay?: number;
    /** Whether to force the action (skip checks) */
    force?: boolean;
    /** Whether to scroll element into view */
    scroll?: boolean;
    /** Whether to log retry attempts (default: false) */
    verbose?: boolean;
    /** Custom error handler */
    onError?: (error: Error, attempt: number) => void | Promise<void>;
}
/**
 * Result of a safe action execution
 */
interface ActionResult<T> {
    /** Whether the action succeeded */
    success: boolean;
    /** The result value if any */
    value?: T;
    /** Error if failed */
    error?: Error;
    /** Number of attempts made */
    attempts: number;
    /** Total duration in ms */
    duration: number;
}
/**
 * Custom error class for safe action failures
 */
export declare class SafeActionError extends Error {
    readonly selector?: string | undefined;
    readonly attempt?: number | undefined;
    readonly cause?: Error | undefined;
    constructor(message: string, selector?: string | undefined, attempt?: number | undefined, cause?: Error | undefined);
}
/**
 * Safely clicks an element with retry capability
 * @param page Playwright Page object
 * @param selector Element selector
 * @param options Configuration options
 * @returns Action result
 */
export declare function clickSafe(page: Page, selector: string, options?: SafeActionOptions): Promise<ActionResult<void>>;
/**
 * Safely fills a form field with retry capability
 * @param page Playwright Page object
 * @param selector Element selector
 * @param text Text to fill
 * @param options Configuration options
 * @returns Action result
 */
export declare function fillSafe(page: Page, selector: string, text: string, options?: SafeActionOptions): Promise<ActionResult<void>>;
/**
 * Safely expects an element condition with retry capability
 * @param locator Playwright Locator object
 * @param assertion The assertion function to run
 * @param options Configuration options
 * @returns Action result
 */
export declare function expectSafe<T>(locator: Locator, assertion: (element: Locator) => Promise<T>, options?: SafeActionOptions): Promise<ActionResult<T>>;
/**
 * Safely waits for a network request with retry capability
 * @param page Playwright Page object
 * @param urlPattern URL pattern to wait for
 * @param options Configuration options
 * @returns Action result with the response
 */
export declare function waitForRequestSafe(page: Page, urlPattern: string | RegExp, options?: SafeActionOptions): Promise<ActionResult<Response>>;
/**
 * Safely executes a custom action with retry capability
 * @param action The async action to perform
 * @param options Configuration options
 * @returns Action result
 */
export declare function executeSafe<T>(action: () => Promise<T>, options?: SafeActionOptions): Promise<ActionResult<T>>;
/**
 * Checks if an error is a SafeActionError
 */
export declare function isSafeActionError(error: unknown): error is SafeActionError;
export {};
//# sourceMappingURL=safeActions.d.ts.map