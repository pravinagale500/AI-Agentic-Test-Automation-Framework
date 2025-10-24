import { CONFIG } from "../config.js";
import { runWithRetries } from "../utils/rerunHandler.js";
import fs from "fs";
import { createLogger, format, transports } from "winston";
/**
 * Custom error for orchestration failures
 */
export class OrchestrationError extends Error {
    details;
    constructor(message, details) {
        super(message);
        this.details = details;
        this.name = "OrchestrationError";
    }
}
// Configure logger
const logger = createLogger({
    level: process.env["LOG_LEVEL"] || "info",
    format: format.combine(format.timestamp(), format.colorize(), format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level}]: ${message}`;
    })),
    transports: [
        new transports.Console(),
        new transports.File({ filename: "error.log", level: "error" }),
        new transports.File({ filename: "orchestrator.log" })
    ]
});
// Load prompts
const promptsPath = new URL("../../prompts/regressionPrompts.json", import.meta.url);
const prompts = JSON.parse(fs.readFileSync(promptsPath, "utf-8"));
// Default configuration
const DEFAULT_CONFIG = {
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
function parseArgs() {
    const tagToRun = process.argv[2];
    const envArg = process.argv[3]?.toLowerCase();
    if (envArg && !["qa", "uat", "prod"].includes(envArg)) {
        throw new OrchestrationError(`Invalid environment: ${envArg}`, `Must be one of: qa, uat, prod`);
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
function interpolateConfigPlaceholders(template) {
    return template.replace(/\$\{CONFIG\.([A-Z0-9_]+)\}/g, (_, key) => {
        if (!(key in CONFIG)) {
            throw new OrchestrationError(`Unknown configuration key: ${key}`, `Available keys: ${Object.keys(CONFIG).join(", ")}`);
        }
        return CONFIG[key] || "";
    });
}
/**
 * Run a single test scenario
 * @param prompt The test prompt to run
 * @param config Orchestrator configuration
 * @param signal Optional abort signal
 */
async function runScenario(prompt, config, signal) {
    const startTime = Date.now();
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Scenario ${prompt.tag} failed: ${errorMessage}`);
        return false;
    }
}
/**
 * Main orchestration function
 * @param config Optional configuration overrides
 */
async function main(config = {}) {
    const startTime = new Date();
    const effectiveConfig = { ...DEFAULT_CONFIG, ...config };
    const controller = new AbortController();
    try {
        const { tagToRun, env } = parseArgs();
        logger.info(`Starting test run in ${env} environment`);
        const scenariosToRun = tagToRun
            ? prompts.filter(p => p.tag === tagToRun)
            : prompts;
        if (scenariosToRun.length === 0) {
            logger.warn(`No scenarios found${tagToRun ? ` for tag: ${tagToRun}` : ""}`);
            return;
        }
        const stats = {
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
                }
                else {
                    stats.failed.push(scenario.tag);
                    if (!effectiveConfig.continueOnFailure) {
                        throw new OrchestrationError("Test run aborted due to failure", `Failed scenario: ${scenario.tag}`);
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
    }
    catch (error) {
        if (error instanceof OrchestrationError) {
            logger.error(`Orchestration error: ${error.message}`);
            if (error.details) {
                logger.error(`Details: ${error.details}`);
            }
        }
        else {
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
// Run the orchestrator with default configuration
if (import.meta.url === `file://${process.argv[1]}`) {
    main({
        concurrency: Number(process.env["CONCURRENCY"]) || DEFAULT_CONFIG.concurrency,
        scenarioTimeout: Number(process.env["SCENARIO_TIMEOUT"]) || DEFAULT_CONFIG.scenarioTimeout,
        retryAttempts: Number(process.env["RETRY_ATTEMPTS"]) || DEFAULT_CONFIG.retryAttempts,
        continueOnFailure: process.env["CONTINUE_ON_FAILURE"] !== "false",
        verbose: process.env["VERBOSE"] === "true"
    }).catch((error) => {
        logger.error("❌ Fatal error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=orchestrator.js.map