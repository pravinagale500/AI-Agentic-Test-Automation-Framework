/**
 * Options for test generation
 */
interface TestGeneratorOptions {
    /** Custom test template to use (optional) */
    template?: string;
    /** Custom test file extension (default: .spec.ts) */
    fileExtension?: string;
    /** Directory to save tests (relative to project root) */
    outputDir?: string;
    /** Whether to validate generated test syntax (default: true) */
    validateSyntax?: boolean;
    /** Whether to format the generated test (default: true) */
    formatCode?: boolean;
    /** AI model temperature for generation (default: 0.7) */
    temperature?: number;
}
/**
 * Result of test generation
 */
interface GeneratedTest {
    /** Path to the generated test file */
    filePath: string;
    /** The generated test content */
    content: string;
    /** Any validation warnings */
    warnings?: string[];
    /** Generation metadata */
    metadata: {
        /** When the test was generated */
        timestamp: string;
        /** Original prompt used */
        prompt: string;
        /** Options used for generation */
        options: Required<TestGeneratorOptions>;
    };
}
/**
 * Custom error for test generation failures
 */
export declare class TestGenerationError extends Error {
    readonly details?: unknown | undefined;
    constructor(message: string, details?: unknown | undefined);
}
/**
 * Generates a test file from a prompt
 * @param prompt Test scenario description
 * @param testName Name of the test (will be used in filename)
 * @param options Generation options
 * @returns Information about the generated test
 * @throws {TestGenerationError} If test generation or validation fails
 */
export declare function generateTest(prompt: string, testName: string, options?: TestGeneratorOptions): Promise<GeneratedTest>;
export {};
//# sourceMappingURL=testGenerator.d.ts.map