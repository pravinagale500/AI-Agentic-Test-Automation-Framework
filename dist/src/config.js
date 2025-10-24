import dotenv from "dotenv";
// Load environment variables from .env file
dotenv.config();
// Define valid environments
const validEnvironments = ["qa", "uat", "prod"];
// Get and validate environment
const env = (process.env['ENV'] || "qa").toLowerCase();
if (!validEnvironments.includes(env)) {
    throw new Error(`Invalid environment: ${env}. Must be one of: ${validEnvironments.join(", ")}`);
}
// Helper function to get environment variables with validation
function getEnvVariable(name, environment) {
    const value = process.env[`${name}_${environment.toUpperCase()}`];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}_${environment.toUpperCase()}`);
    }
    return value;
}
// Get OpenAI API key
const OPENAI_API_KEY = process.env["OPENAI_API_KEY"];
if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required");
}
// Export typed configuration
export const CONFIG = {
    ENV: env,
    BASE_URL: getEnvVariable("BASE_URL", env),
    USERNAME: getEnvVariable("USERNAME", env),
    PASSWORD: getEnvVariable("PASSWORD", env),
    OPENAI_API_KEY
};
//# sourceMappingURL=config.js.map