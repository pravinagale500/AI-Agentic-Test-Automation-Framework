import { type Page, type Locator, expect, type Response } from "@playwright/test";
import { createLogger, format, transports } from "winston";

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
export class SafeActionError extends Error {
  constructor(
    message: string,
    public readonly selector?: string,
    public readonly attempt?: number,
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = 'SafeActionError';
    // Preserve stack trace
    Error.captureStackTrace(this, SafeActionError);
  }
}

// Configure logger
const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'error.log', level: 'error' }),
    new transports.File({ filename: 'actions.log' })
  ]
});

const DEFAULT_OPTIONS: Required<SafeActionOptions> = {
  retries: 3,
  timeout: 5000,
  delay: 500,
  force: false,
  scroll: true,
  verbose: false,
  onError: null as unknown as (error: Error, attempt: number) => void
} as const;

/**
 * Safely retry an async function with configurable options
 * @param action The async function to retry
 * @param options Configuration options
 * @returns Result of the action
 */
async function withRetry<T>(
  action: () => Promise<T>,
  options: Required<SafeActionOptions>,
  actionName: string,
  target?: string
): Promise<ActionResult<T>> {
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
    } catch (error) {
      const isLastAttempt = i === options.retries - 1;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn(`${actionName} attempt ${attempts} failed: ${errorMessage}`, {
        target,
        attempts,
        isLastAttempt
      });

      if (options.onError) {
        await options.onError(
          error instanceof Error ? error : new Error(String(error)),
          attempts
        );
      }

      if (isLastAttempt) {
        const duration = Date.now() - startTime;
        const finalError = new SafeActionError(
          `${actionName} failed after ${attempts} attempts: ${errorMessage}`,
          target,
          attempts,
          error instanceof Error ? error : undefined
        );

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
export async function clickSafe(
  page: Page,
  selector: string,
  options: SafeActionOptions = {}
): Promise<ActionResult<void>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return withRetry(
    async () => {
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
    },
    opts,
    'Click',
    selector
  );
}

/**
 * Safely fills a form field with retry capability
 * @param page Playwright Page object
 * @param selector Element selector
 * @param text Text to fill
 * @param options Configuration options
 * @returns Action result
 */
export async function fillSafe(
  page: Page,
  selector: string,
  text: string,
  options: SafeActionOptions = {}
): Promise<ActionResult<void>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return withRetry(
    async () => {
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
        throw new SafeActionError(
          `Text verification failed. Expected: "${text}", Got: "${actualText}"`,
          selector
        );
      }
    },
    opts,
    'Fill',
    selector
  );
}

/**
 * Safely expects an element condition with retry capability
 * @param locator Playwright Locator object
 * @param assertion The assertion function to run
 * @param options Configuration options
 * @returns Action result
 */
export async function expectSafe<T>(
  locator: Locator,
  assertion: (element: Locator) => Promise<T>,
  options: SafeActionOptions = {}
): Promise<ActionResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return withRetry(
    async () => {
      if (opts.scroll) {
        await locator.scrollIntoViewIfNeeded();
      }
      return assertion(locator);
    },
    opts,
    'Expect',
    locator.toString()
  );
}

/**
 * Safely waits for a network request with retry capability
 * @param page Playwright Page object
 * @param urlPattern URL pattern to wait for
 * @param options Configuration options
 * @returns Action result with the response
 */
export async function waitForRequestSafe(
  page: Page,
  urlPattern: string | RegExp,
  options: SafeActionOptions = {}
): Promise<ActionResult<Response>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return withRetry(
    async () => page.waitForResponse(urlPattern, { timeout: opts.timeout }),
    opts,
    'WaitForRequest',
    urlPattern.toString()
  );
}

/**
 * Safely executes a custom action with retry capability
 * @param action The async action to perform
 * @param options Configuration options
 * @returns Action result
 */
export async function executeSafe<T>(
  action: () => Promise<T>,
  options: SafeActionOptions = {}
): Promise<ActionResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return withRetry(action, opts, 'CustomAction');
}

/**
 * Checks if an error is a SafeActionError
 */
export function isSafeActionError(error: unknown): error is SafeActionError {
  return error instanceof SafeActionError;
}
