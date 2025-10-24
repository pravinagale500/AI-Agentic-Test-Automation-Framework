import { CONFIG } from "../config.js";
import { runWithRetries } from "../utils/rerunHandler.js";
import fs from "fs";
import { createLogger, format, transports } from "winston";

/**
 * Custom error for orchestration failures
 */
export class OrchestrationError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "OrchestrationError";
  }
}

/**
 * Test prompt definition
 */
interface TestPrompt {
  /** Unique identifier for the test */
  tag: string;
  /** Human-readable test description */
  description: string;
  /** The test generation prompt */
  prompt: string;
}

/**
 * Test run statistics
 */
interface RunStats {
  /** Total number of scenarios */
  total: number;
  /** Number of passed scenarios */
  passed: number;
  /** Array of failed scenario tags */
  failed: string[];
  /** Start time of the run */
  startTime: Date;
  /** End time of the run */
  endTime?: Date;
  /** Duration in milliseconds */
  duration?: number;
}

/**
 * Orchestrator configuration
 */
interface OrchestratorConfig {
  /** Maximum concurrent test runs */
  concurrency?: number;
  /** Timeout for each scenario in ms */
  scenarioTimeout?: number;
  /** Number of retry attempts */
  retryAttempts?: number;
  /** Whether to continue on failure */
  continueOnFailure?: boolean;
  /** Whether to enable verbose logging */
  verbose?: boolean;
}

// Configure logger
const logger = createLogger({
  level: "debug", // Force debug level
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
      return `${timestamp} [${level}]: ${message}${metaStr}`;
    })
  ),
  transports: [
    new transports.Console({
      level: "debug",
      handleExceptions: true,
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    new transports.File({ 
      filename: "error.log",
      level: "error",
      handleExceptions: true
    }),
    new transports.File({ 
      filename: "orchestrator.log",
      level: "debug"
    })
  ]
});

// Load prompts
const promptsPath = new URL("../../prompts/regressionPrompts.json", import.meta.url);
const prompts: TestPrompt[] = JSON.parse(fs.readFileSync(promptsPath, "utf-8"));

// Default configuration
const DEFAULT_CONFIG: Required<OrchestratorConfig> = {
  concurrency: 1,
  scenarioTimeout: 5 * 60 * 1000, // 5 minutes
  retryAttempts: 2,
  continueOnFailure: true,
  verbose: false
};

/**
 * Process and validate command line arguments
 * @throws {OrchestrationError} If environment is invalid
 */
function parseArgs(): { tagToRun: string | undefined; env: string } {
  const tagToRun = process.argv[2];
  const envArg = process.argv[3]?.toLowerCase();

  if (envArg && !["qa", "uat", "prod"].includes(envArg)) {
    throw new OrchestrationError(
      `Invalid environment: ${envArg}`,
      `Must be one of: qa, uat, prod`
    );
  }

  if (envArg) {
    process.env["ENV"] = envArg;
  }

  return { tagToRun, env: process.env["ENV"] || "qa" };
}

/**
 * Replace configuration placeholders in template string
 * @throws {OrchestrationError} If configuration key is unknown
 */
function interpolateConfigPlaceholders(template: string): string {
  return template.replace(/\$\{CONFIG\.([A-Z0-9_]+)\}/g, (_, key) => {
    if (!(key in CONFIG)) {
      throw new OrchestrationError(
        `Unknown configuration key: ${key}`,
        `Available keys: ${Object.keys(CONFIG).join(", ")}`
      );
    }
    return CONFIG[key as keyof typeof CONFIG] || "";
  });
}

/**
 * Run a single test scenario
 * @param prompt The test prompt to run
 * @param config Orchestrator configuration
 * @param signal Optional abort signal
 */
async function runScenario(
  prompt: TestPrompt,
  config: Required<OrchestratorConfig>,
  signal?: AbortSignal
): Promise<boolean> {
  const startTime = Date.now();
  console.log(`Debug: Starting scenario: ${prompt.tag}`);
  console.log(`Debug: Description: ${prompt.description}`);
  console.log(`Debug: Raw prompt: ${prompt.prompt}`);
  logger.info(`Running scenario: ${prompt.tag} - ${prompt.description}`);

  try {
    if (signal?.aborted) {
      throw new OrchestrationError("Scenario aborted by user");
    }

    // Validate prompt
    if (!prompt.prompt.trim()) {
      throw new OrchestrationError("Empty prompt");
    }

    const expandedPrompt = interpolateConfigPlaceholders(prompt.prompt);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new OrchestrationError(`Scenario timed out after ${config.scenarioTimeout}ms`));
      }, config.scenarioTimeout);
    });

    await Promise.race([
      runWithRetries(expandedPrompt, prompt.tag, config.retryAttempts),
      timeoutPromise
    ]);

    const duration = Date.now() - startTime;
    logger.info(`Scenario ${prompt.tag} passed in ${duration}ms`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Scenario ${prompt.tag} failed: ${errorMessage}`);
    return false;
  }
}

/**
 * Main orchestration function
 * @param config Optional configuration overrides
 */
async function main(config: OrchestratorConfig = {}) {
  console.log('Main function started');
  process.stdout.write('Starting orchestrator...\n');
  
  const startTime = new Date();
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config };
  const controller = new AbortController();

  try {
    const { tagToRun, env } = parseArgs();
    logger.info(`Starting test run in ${env} environment with tag ${tagToRun || 'ALL'}`);

    // Enhanced logging
    console.log(`Debug: Starting test run with tag: ${tagToRun}`);
    console.log(`Debug: Environment: ${env}`);
    console.log(`Debug: Loaded ${prompts.length} prompts`);
    
    // Verify config
    const configDebug = {
      ...CONFIG,
      // Mask sensitive data
      OPENAI_API_KEY: CONFIG.OPENAI_API_KEY ? '***' : undefined,
      PASSWORD: CONFIG.PASSWORD ? '***' : undefined
    };
    
    console.log('Debug: Configuration:', configDebug);
    logger.info('Using configuration:', configDebug);

    const scenariosToRun = tagToRun 
      ? prompts.filter(p => p.tag === tagToRun)
      : prompts;

    if (scenariosToRun.length === 0) {
      logger.warn(`No scenarios found${tagToRun ? ` for tag: ${tagToRun}` : ""}`);
      return;
    }

    const stats: RunStats = {
      total: scenariosToRun.length,
      passed: 0,
      failed: [],
      startTime,
    };

    // Set up signal handlers
    process.once('SIGINT', () => {
      logger.warn('Received SIGINT. Gracefully shutting down...');
      controller.abort();
    });

    process.once('SIGTERM', () => {
      logger.warn('Received SIGTERM. Gracefully shutting down...');
      controller.abort();
    });

    // Run scenarios with concurrency control
    const chunks = [];
    for (let i = 0; i < scenariosToRun.length; i += effectiveConfig.concurrency) {
      chunks.push(scenariosToRun.slice(i, i + effectiveConfig.concurrency));
    }

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (scenario) => {
        const result = await runScenario(scenario, effectiveConfig, controller.signal);
        return { scenario, passed: result };
      });

      const chunkResults = await Promise.all(chunkPromises);

      for (const { scenario, passed } of chunkResults) {
        if (passed) {
          stats.passed++;
        } else {
          stats.failed.push(scenario.tag);
          if (!effectiveConfig.continueOnFailure) {
            throw new OrchestrationError(
              "Test run aborted due to failure",
              `Failed scenario: ${scenario.tag}`
            );
          }
        }
      }
    }

    // Calculate final statistics
    stats.endTime = new Date();
    stats.duration = stats.endTime.getTime() - stats.startTime.getTime();

    // Log summary
    logger.info("\n📊 Test Run Summary");
    logger.info(`Duration: ${stats.duration / 1000}s`);
    logger.info(`Total: ${stats.total}`);
    logger.info(`Passed: ${stats.passed}`);
    logger.info(`Failed: ${stats.failed.length}`);
    
    if (stats.failed.length > 0) {
      logger.error("Failed scenarios:", stats.failed.join(", "));
      process.exit(1);
    }

    logger.info("✅ Test run completed successfully");
  } catch (error) {
    if (error instanceof OrchestrationError) {
      logger.error(`Orchestration error: ${error.message}`);
      if (error.details) {
        logger.error(`Details: ${error.details}`);
      }
    } else {
      logger.error("Unexpected error:", error);
    }
    process.exit(1);
  }
}

// Handle uncaught errors
process.on("unhandledRejection", (error) => {
  logger.error("❌ Unhandled rejection:", error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("❌ Uncaught exception:", error);
  process.exit(1);
});

// Run the orchestrator
console.log('Starting main execution...');
main({
  concurrency: Number(process.env["CONCURRENCY"]) || DEFAULT_CONFIG.concurrency,
  scenarioTimeout: Number(process.env["SCENARIO_TIMEOUT"]) || DEFAULT_CONFIG.scenarioTimeout,
  retryAttempts: Number(process.env["RETRY_ATTEMPTS"]) || DEFAULT_CONFIG.retryAttempts,
  continueOnFailure: process.env["CONTINUE_ON_FAILURE"] !== "false",
  verbose: process.env["VERBOSE"] === "true"
}).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
