import OpenAI from "openai";
import { CONFIG } from "../config.js";
import { createLogger, format, transports } from "winston";

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

// Configure logger
const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'error.log', level: 'error' }),
    new transports.File({ filename: 'ai-client.log' })
  ]
});

/**
 * Custom error for AI-related failures
 */
export class AIError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "AIError";
  }
}

/**
 * AIClient class for interacting with OpenAI's API
 */
export class AIClient {
  private readonly openai: OpenAI;
  private readonly config: Required<AIClientConfig>;

  /**
   * Creates a new AIClient instance
   * @param apiKey OpenAI API key
   * @param config Optional configuration overrides
   * @throws {AIError} If API key is missing or invalid
   */
  constructor(
    apiKey: string = CONFIG.OPENAI_API_KEY,
    config: AIClientConfig = {}
  ) {
    if (!apiKey?.trim()) {
      throw new AIError("OpenAI API key is required");
    }

    this.openai = new OpenAI({ apiKey });
    this.config = {
      model: config.model || "gpt-3.5-turbo",
      temperature: config.temperature ?? 0.7,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      systemPrompt: config.systemPrompt ?? this.getDefaultSystemPrompt(),
      timeout: config.timeout ?? 30000
    };

    logger.info("AIClient initialized", {
      model: this.config.model,
      temperature: this.config.temperature
    });
  }

  private getDefaultSystemPrompt(): string {
    return `You are an expert AI assistant specialized in software testing and automation.
Generate high-quality, maintainable test code following these best practices:

Test Design:
- Follow Arrange-Act-Assert pattern
- Keep tests focused and single-purpose
- Use meaningful, descriptive test names
- Include proper setup/teardown
- Ensure test isolation

Code Quality:
- Implement proper error handling
- Add descriptive assertion messages
- Follow TypeScript best practices
- Keep code DRY and maintainable
- Add JSDoc documentation

Test Stability:
- Handle timeouts and retries
- Add proper waits and assertions
- Avoid flaky selectors
- Consider edge cases
- Implement proper logging

Performance:
- Optimize test execution
- Avoid unnecessary waits
- Reuse browser contexts when possible
- Implement parallel execution
- Consider resource cleanup`;
  }

  /**
   * Send a prompt to the AI and get a response with retries
   * @param prompt The user's prompt
   * @param config Optional per-request configuration
   * @returns Promise with the AI's response
   * @throws {AIError} If API call fails after all retries
   */
  async ask(prompt: string, config: Partial<AIClientConfig> = {}): Promise<AIResponse> {
    const startTime = Date.now();
    let retryCount = 0;

    try {
      if (!prompt?.trim()) {
        throw new AIError("Prompt cannot be empty");
      }

      const effectiveConfig = { ...this.config, ...config };
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= effectiveConfig.maxRetries; attempt++) {
        try {
          const completion = await Promise.race([
            this.openai.chat.completions.create({
              model: effectiveConfig.model,
              messages: [
                {
                  role: "system",
                  content: effectiveConfig.systemPrompt
                },
                { role: "user", content: prompt }
              ],
              temperature: effectiveConfig.temperature,
              max_tokens: 2000,
              presence_penalty: 0.1,
              frequency_penalty: 0.1
            }),
            new Promise((_, reject) => setTimeout(() => reject(new AIError("Request timeout")), effectiveConfig.timeout))
          ]) as OpenAI.Chat.ChatCompletion;

          const content = completion.choices[0]?.message?.content;
          if (!content?.trim()) {
            throw new AIError("Empty response from OpenAI");
          }

          const duration = Date.now() - startTime;
          logger.info("AI response generated", {
            duration,
            model: effectiveConfig.model,
            tokens: completion.usage?.total_tokens
          });

          return {
            content,
            usage: completion.usage ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens
            } : undefined,
            metadata: {
              timestamp: new Date().toISOString(),
              model: effectiveConfig.model,
              duration,
              retries: retryCount
            }
          };
        } catch (error) {
          retryCount++;
          lastError = error instanceof Error ? error : new Error(String(error));
          logger.warn(`Attempt ${attempt} failed`, {
            error: lastError.message,
            attempt,
            retryCount
          });

          if (attempt < effectiveConfig.maxRetries) {
            const delay = effectiveConfig.retryDelay * Math.pow(2, attempt - 1);
            await this.sleep(delay); // Exponential backoff
            continue;
          }
        }
      }

      throw new AIError(
        `Failed after ${effectiveConfig.maxRetries} attempts`,
        lastError?.message
      );
    } catch (error) {
      const finalError = error instanceof Error ? error : new Error(String(error));
      logger.error("AI request failed", {
        error: finalError.message,
        duration: Date.now() - startTime,
        retries: retryCount
      });
      throw new AIError(finalError.message, {
        duration: Date.now() - startTime,
        retries: retryCount
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Simplified function for generating AI responses
 * @param prompt The prompt to send to the AI
 * @param temperature Optional temperature override
 * @returns Promise with the generated content
 */
export const askAI = async (prompt: string, temperature?: number): Promise<string> => {
  const client = new AIClient();
  const config = temperature !== undefined ? { temperature } : {};
  const response = await client.ask(prompt, config);
  return response.content;
};
