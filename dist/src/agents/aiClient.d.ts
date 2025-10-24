/**
 * Configuration options for the AI client
 */
interface AIClientConfig {
    /** OpenAI model to use (default: gpt-4) */
    model?: string;
    /** Temperature for response randomness (default: 0.7) */
    temperature?: number;
    /** Maximum retry attempts (default: 3) */
    maxRetries?: number;
    /** Base delay between retries in ms (default: 1000) */
    retryDelay?: number;
    /** Custom system prompt override */
    systemPrompt?: string;
    /** Timeout for API calls in ms (default: 30000) */
    timeout?: number;
}
/**
 * Response from the AI service
 */
interface AIResponse {
    /** Generated content */
    content: string;
    /** Token usage statistics */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    /** Generation metadata */
    metadata: {
        /** Generation timestamp */
        timestamp: string;
        /** Model used */
        model: string;
        /** Time taken in ms */
        duration: number;
        /** Number of retries needed */
        retries: number;
    };
}
/**
 * Custom error for AI-related failures
 */
export declare class AIError extends Error {
    readonly details?: unknown | undefined;
    constructor(message: string, details?: unknown | undefined);
}
/**
 * AIClient class for interacting with OpenAI's API
 */
export declare class AIClient {
    private readonly openai;
    private readonly config;
    /**
     * Creates a new AIClient instance
     * @param apiKey OpenAI API key
     * @param config Optional configuration overrides
     * @throws {AIError} If API key is missing or invalid
     */
    constructor(apiKey?: string, config?: AIClientConfig);
    private getDefaultSystemPrompt;
    /**
     * Send a prompt to the AI and get a response with retries
     * @param prompt The user's prompt
     * @param config Optional per-request configuration
     * @returns Promise with the AI's response
     * @throws {AIError} If API call fails after all retries
     */
    ask(prompt: string, config?: Partial<AIClientConfig>): Promise<AIResponse>;
    private sleep;
}
/**
 * Simplified function for generating AI responses
 * @param prompt The prompt to send to the AI
 * @param temperature Optional temperature override
 * @returns Promise with the generated content
 */
export declare const askAI: (prompt: string, temperature?: number) => Promise<string>;
export {};
//# sourceMappingURL=aiClient.d.ts.map