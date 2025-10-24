interface RunOptions {
    reporter?: string;
    timeout?: number;
    workers?: number;
    retries?: number;
}
/**
 * Runs a test with automatic retries on failure
 * @param prompt - The test prompt to generate the test from
 * @param tag - The tag to identify the test
 * @param attempts - Number of retry attempts (default: 2)
 * @param options - Additional test run options
 * @returns Promise that resolves when the test passes or rejects after all attempts fail
 */
export declare function runWithRetries(prompt: string, tag: string, attempts?: number, options?: RunOptions): Promise<void>;
export {};
//# sourceMappingURL=rerunHandler.d.ts.map