import { generateTest } from "../agents/testGenerator.js";
import { execSync } from "child_process";
import type { ExecSyncOptions } from "child_process";
import path from "path";
import { createLogger, format, transports } from "winston";

// Configure logger
const logger = createLogger({
  level: "debug",
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
      return `${timestamp} [${level}]: ${message}${metaStr}`;
    })
  ),
  transports: [
    new transports.Console({ level: "debug" }),
    new transports.File({ filename: "rerun.log", level: "debug" })
  ]
});

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
export async function runWithRetries(
  prompt: string, 
  tag: string, 
  attempts = 2,
  options: RunOptions = {}
): Promise<void> {
  const {
    reporter = "list",
    timeout = 30000,
    workers = 1,
    retries = 0
  } = options;

  const execOptions: ExecSyncOptions = {
    stdio: "inherit",
    timeout,
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: "1" }
  };

  for (let i = 1; i <= attempts; i++) {
    try {
      logger.info(`Attempt ${i} of ${attempts}`, { tag, prompt: prompt.slice(0, 100) });
      
      logger.debug('Generating test...', { tag });
      const result = await generateTest(prompt, tag);
      logger.debug('Test generated', { 
        tag,
        filePath: result.filePath,
        warnings: result.warnings
      });

      const testPath = path.resolve(__dirname, "../tests", `${tag}.spec.ts`);
      const command = [
        "npx playwright test",
        testPath,
        `--reporter=${reporter}`,
        `--workers=${workers}`,
        `--retries=${retries}`,
      ].join(" ");

      logger.info(`Running test command: ${command}`);
      execSync(command, execOptions);
      logger.info("Test passed successfully", { tag, attempt: i });
      return;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`Test attempt ${i} failed`, {
        tag,
        error: errorMessage.slice(0, 300),
        attempt: i,
        totalAttempts: attempts
      });
      
      if (i === attempts) {
        logger.error("All test attempts exhausted", {
          tag,
          attempts,
          lastError: errorMessage
        });
        throw new Error(`Test failed after ${attempts} attempts: ${errorMessage}`);
      }
      
      logger.info("Regenerating test for next attempt", {
        tag,
        nextAttempt: i + 1
      });
    }
  }
}
