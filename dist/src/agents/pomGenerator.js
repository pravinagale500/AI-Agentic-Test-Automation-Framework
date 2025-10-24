import fs from "fs";
import path from "path";
import { OpenAI } from "openai";
/**
 * Custom error class for POM generation failures
 */
export class POMGenerationError extends Error {
    details;
    constructor(message, details) {
        super(message);
        this.details = details;
        this.name = "POMGenerationError";
    }
}
const SYSTEM_PROMPT_POM = `
You are an expert Playwright automation engineer specializing in Page Object Models.
Generate TypeScript Playwright Page Object Model classes for the given scenario.
Requirements:
- Each class must extend Playwright's Page class
- Use semantic selectors: getByRole(), getByLabel(), getByPlaceholder(), getByTestId()
- Create methods for each major page interaction
- Add proper TypeScript types and return values
- Include error handling with try/catch
- Add JSDoc documentation for public methods
- Include proper constructor initialization
- Use proper async/await patterns
- Avoid hardcoding values, use parameters instead
- Follow naming conventions: camelCase for methods, PascalCase for classes
- Keep methods focused and single-responsibility
- Include logging for important actions
Output ONLY TypeScript code without any additional commentary.
`;
const DEFAULTS = {
    model: "gpt-4",
    outputDir: path.join(process.cwd(), "src", "pom"),
    temperature: 0.7
};
/**
 * POMGenerator class for creating Page Object Model files
 */
export class POMGenerator {
    options;
    openai;
    /**
     * Creates a new POMGenerator instance
     * @param apiKey OpenAI API key
     * @param options Optional configuration options
     */
    constructor(apiKey, options = {}) {
        this.options = options;
        if (!apiKey) {
            throw new POMGenerationError("OpenAI API key is required");
        }
        this.openai = new OpenAI({ apiKey });
    }
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
    async generatePOMs(prompt) {
        if (!prompt?.trim()) {
            throw new POMGenerationError("Prompt cannot be empty");
        }
        try {
            const code = await this.getGeneratedCode(prompt);
            const poms = this.parseGeneratedCode(code);
            return await this.writePOMFiles(poms);
        }
        catch (error) {
            if (error instanceof POMGenerationError) {
                throw error;
            }
            throw new POMGenerationError("Failed to generate POMs", error);
        }
    }
    /**
     * Generates code using OpenAI API
     * @param prompt The user prompt to generate code from
     * @throws {POMGenerationError} If API call fails or returns invalid response
     * @returns Promise resolving to generated code
     */
    async getGeneratedCode(prompt) {
        try {
            const response = await this.openai.chat.completions.create({
                model: this.options.model || DEFAULTS.model,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT_POM },
                    { role: "user", content: prompt }
                ],
                max_tokens: 2000,
                temperature: this.options.temperature || DEFAULTS.temperature,
                presence_penalty: 0.1, // Encourage some variation
                frequency_penalty: 0.1, // Discourage repetition
            });
            const code = response.choices[0]?.message?.content;
            if (!code?.trim()) {
                throw new POMGenerationError("No code generated from OpenAI");
            }
            return code;
        }
        catch (error) {
            throw new POMGenerationError("OpenAI API error", error instanceof Error ? error.message : String(error));
        }
    }
    parseGeneratedCode(code) {
        // Use regex to properly match class definitions
        const classRegex = /export\s+class\s+(\w+)(?:\s+extends\s+\w+)?\s*{[\s\S]*?(?=export\s+class|$)/g;
        const matches = Array.from(code.matchAll(classRegex));
        if (matches.length === 0) {
            throw new POMGenerationError("No valid Page Object classes found in generated code");
        }
        return matches.map(match => {
            const content = match[0].trim();
            const className = match[1];
            if (!className) {
                throw new POMGenerationError("Failed to extract class name from generated code");
            }
            // Validate class name
            if (!/^[A-Z][a-zA-Z0-9]*$/.test(className)) {
                throw new POMGenerationError(`Invalid class name: ${className}`);
            }
            const outputDir = this.options.outputDir || DEFAULTS.outputDir;
            const filePath = path.join(outputDir, `${className}.ts`);
            const warnings = [];
            // Validate class content
            const validationWarnings = this.validateClassContent(content);
            if (validationWarnings.length > 0) {
                warnings.push(...validationWarnings);
            }
            return { className, content, filePath, warnings: warnings.length > 0 ? warnings : undefined };
        });
    }
    /**
     * Validates the content of a generated class
     * @param content The class content to validate
     * @returns Array of warning messages
     */
    validateClassContent(content) {
        const warnings = [];
        // Structure validation
        if (!content.trim().startsWith("export class")) {
            warnings.push("Class definition does not start with 'export class'");
        }
        if (!content.includes("extends Page")) {
            warnings.push("Class does not extend Playwright's Page class");
        }
        if (!content.includes("constructor")) {
            warnings.push("Class is missing a constructor");
        }
        if (!content.includes("super(")) {
            warnings.push("Constructor does not call super()");
        }
        // Code quality checks
        if (content.includes("```")) {
            warnings.push("Code contains markdown artifacts");
        }
        if (content.includes("TODO")) {
            warnings.push("Code contains TODO comments");
        }
        if (content.includes("any")) {
            warnings.push("Code contains 'any' type - consider using specific types");
        }
        // Playwright patterns
        if (!content.includes("async")) {
            warnings.push("No async methods found - POM should contain page interactions");
        }
        if (!content.includes("await")) {
            warnings.push("No await keywords found - POM should contain async operations");
        }
        // Selector patterns
        const selectorPatterns = [
            "getByRole",
            "getByLabel",
            "getByPlaceholder",
            "getByTestId",
            "locator"
        ];
        if (!selectorPatterns.some(pattern => content.includes(pattern))) {
            warnings.push("No recommended Playwright selectors found");
        }
        // Method patterns
        if (!content.includes("return")) {
            warnings.push("No return statements found - methods should return values or promises");
        }
        if (!content.includes("try")) {
            warnings.push("No error handling found - consider adding try/catch blocks");
        }
        if (content.includes("Thread.sleep") || content.includes("setTimeout")) {
            warnings.push("Avoid using explicit sleeps - use Playwright's built-in waiting mechanisms");
        }
        // Documentation
        if (!content.includes("@param") && !content.includes("@returns")) {
            warnings.push("Missing JSDoc documentation for methods");
        }
        return warnings;
    }
    async writePOMFiles(poms) {
        try {
            const outputDir = this.options.outputDir || DEFAULTS.outputDir;
            // Ensure output directory exists
            await fs.promises.mkdir(outputDir, { recursive: true });
            for (const pom of poms) {
                // Validate file path
                const normalizedPath = path.normalize(pom.filePath);
                if (!normalizedPath.startsWith(outputDir)) {
                    throw new POMGenerationError(`Invalid file path: ${pom.filePath}`);
                }
                const fileContent = this.generateFileContent(pom);
                await fs.promises.writeFile(pom.filePath, fileContent, "utf8");
                if (pom.warnings && pom.warnings.length > 0) {
                    console.log(`⚠️ Warnings for ${pom.className}:`);
                    pom.warnings.forEach(warning => console.log(`   - ${warning}`));
                }
                console.log(`📄 Generated POM: ${path.relative(process.cwd(), pom.filePath)}`);
            }
            return poms;
        }
        catch (error) {
            throw new POMGenerationError("Failed to write POM files", error instanceof Error ? error.message : String(error));
        }
    }
    /**
     * Generates the final file content with imports and metadata
     * @param pom The POM details
     * @returns Formatted file content
     */
    generateFileContent(pom) {
        const timestamp = new Date().toISOString();
        return [
            '// @ts-check',
            `// Generated by POMGenerator on ${timestamp}`,
            `// Class: ${pom.className}`,
            '',
            '/* eslint-disable max-len */',
            'import { expect, type Page } from "@playwright/test";',
            '',
            '/**',
            ' * Page Object Model for handling page interactions',
            ` * @class ${pom.className}`,
            ' * @extends {Page}',
            ' */',
            '',
            pom.content.trim(),
            ''
        ].join('\n');
    }
}
//# sourceMappingURL=pomGenerator.js.map