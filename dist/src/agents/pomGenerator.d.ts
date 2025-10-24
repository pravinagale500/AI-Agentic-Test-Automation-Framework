/**
 * Custom error class for POM generation failures
 */
export declare class POMGenerationError extends Error {
    readonly details?: unknown | undefined;
    constructor(message: string, details?: unknown | undefined);
}
/**
 * Represents a generated Page Object Model
 */
export interface GeneratedPOM {
    /** The name of the generated class */
    className: string;
    /** The TypeScript code content */
    content: string;
    /** The absolute file path where the POM will be saved */
    filePath: string;
    /** Any validation warnings */
    warnings?: string[];
}
/**
 * POMGenerator class for creating Page Object Model files
 */
export declare class POMGenerator {
    private readonly options;
    private readonly openai;
    /**
     * Creates a new POMGenerator instance
     * @param apiKey OpenAI API key
     * @param options Optional configuration options
     */
    constructor(apiKey: string, options?: {
        /** Output directory for generated POMs (default: src/pom) */
        outputDir?: string;
        /** Model to use for generation (default: gpt-4) */
        model?: string;
        /** Temperature for generation (default: 0.7) */
        temperature?: number;
    });
    /**
     * Generates Page Object Model classes from a given prompt
     * @param prompt The scenario description to generate POMs for
     * @returns Array of generated POM details
     */
    /**
     * Generates Page Object Model classes from a given prompt
     * @param prompt The scenario description or requirements for the page objects
     * @throws {POMGenerationError} If generation, validation, or file operations fail
     * @returns Promise resolving to array of generated POM details
     */
    generatePOMs(prompt: string): Promise<GeneratedPOM[]>;
    /**
     * Generates code using OpenAI API
     * @param prompt The user prompt to generate code from
     * @throws {POMGenerationError} If API call fails or returns invalid response
     * @returns Promise resolving to generated code
     */
    private getGeneratedCode;
    private parseGeneratedCode;
    /**
     * Validates the content of a generated class
     * @param content The class content to validate
     * @returns Array of warning messages
     */
    private validateClassContent;
    private writePOMFiles;
    /**
     * Generates the final file content with imports and metadata
     * @param pom The POM details
     * @returns Formatted file content
     */
    private generateFileContent;
}
//# sourceMappingURL=pomGenerator.d.ts.map