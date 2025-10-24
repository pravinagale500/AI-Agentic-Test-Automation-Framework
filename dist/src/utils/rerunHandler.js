import { generateTest } from "../agents/testGenerator.js";
import { execSync } from "child_process";
import path from "path";
/**
 * Runs a test with automatic retries on failure
 * @param prompt - The test prompt to generate the test from
 * @param tag - The tag to identify the test
 * @param attempts - Number of retry attempts (default: 2)
 * @param options - Additional test run options
 * @returns Promise that resolves when the test passes or rejects after all attempts fail
 */
export async function runWithRetries(prompt, tag, attempts = 2, options = {}) {
    const { reporter = "list", timeout = 30000, workers = 1, retries = 0 } = options;
    const execOptions = {
        stdio: "inherit",
        timeout,
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: "1" }
    };
    for (let i = 1; i <= attempts; i++) {
        try {
            console.log(`\n🧪 Attempt ${i} of ${attempts} for tag=${tag}`);
            await generateTest(prompt, tag);
            const testPath = path.resolve(__dirname, "../tests", `${tag}.spec.ts`);
            const command = [
                "npx playwright test",
                testPath,
                `--reporter=${reporter}`,
                `--workers=${workers}`,
                `--retries=${retries}`,
            ].join(" ");
            execSync(command, execOptions);
            console.log("✅ Test passed");
            return;
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(`⚠️ Attempt ${i} failed:`, errorMessage.slice(0, 300));
            if (i === attempts) {
                console.error("🚨 All attempts failed.");
                throw new Error(`Test failed after ${attempts} attempts: ${errorMessage}`);
            }
            console.log("🔁 Regenerating test and retrying...");
        }
    }
}
//# sourceMappingURL=rerunHandler.js.map