import fs from "fs";
import path from "path";
import { askAI } from "./aiClient.js";
import { createLogger, format, transports } from "winston";

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

const DEFAULT_OPTIONS: Required<TestGeneratorOptions> = {
  template: '',
  fileExtension: '.spec.ts',
  outputDir: 'tests/generated',
  validateSyntax: true,
  formatCode: true,
  temperature: 0.7
} as const;

// Configure logger
const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'error.log', level: 'error' }),
    new transports.File({ filename: 'test-generator.log' })
  ]
});

/**
 * Custom error for test generation failures
 */
export class TestGenerationError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'TestGenerationError';
  }
}

/**
 * Generates a test file from a prompt
 * @param prompt Test scenario description
 * @param testName Name of the test (will be used in filename)
 * @param options Generation options
 * @returns Information about the generated test
 * @throws {TestGenerationError} If test generation or validation fails
 */
export async function generateTest(
  prompt: string,
  testName: string,
  options: TestGeneratorOptions = {}
): Promise<GeneratedTest> {
  const opts: Required<TestGeneratorOptions> = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];
  const startTime = Date.now();

  try {
    // Validate inputs
    validateInputs(prompt, testName);

    // Ensure output directory exists
    const testDir = await ensureOutputDirectory(opts.outputDir);

    // Generate test content
    let content = await generateTestContent(prompt, opts);
    
    // Validate syntax if requested
    if (opts.validateSyntax) {
      const syntaxIssues = validateTestSyntax(content);
      warnings.push(...syntaxIssues);
    }

    // Format code if requested
    if (opts.formatCode) {
      content = await formatTestCode(content);
    }

    // Write test file
    const testFilePath = await writeTestFile(testDir, testName, content, opts);
    const duration = Date.now() - startTime;

    logger.info(`Test generated successfully in ${duration}ms: ${path.relative(process.cwd(), testFilePath)}`);
    if (warnings.length > 0) {
      logger.warn(`Warnings for ${testName}:`, { warnings });
    }

    return {
      filePath: testFilePath,
      content,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        timestamp: new Date().toISOString(),
        prompt,
        options: opts
      }
    };
  } catch (error) {
    logger.error('Test generation failed:', { error, prompt, testName });
    if (error instanceof TestGenerationError) {
      throw error;
    }
    throw new TestGenerationError(
      'Failed to generate test',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Validates input parameters
 * @throws {TestGenerationError} If validation fails
 */
function validateInputs(prompt: string, testName: string): void {
  if (!prompt?.trim()) {
    throw new TestGenerationError('Prompt cannot be empty');
  }
  if (!testName?.trim()) {
    throw new TestGenerationError('Test name cannot be empty');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(testName)) {
    throw new TestGenerationError(
      'Test name contains invalid characters',
      'Use only letters, numbers, underscores, and hyphens'
    );
  }
}

/**
 * Ensures output directory exists
 * @throws {TestGenerationError} If directory creation fails
 */
async function ensureOutputDirectory(outputDir: string): Promise<string> {
  try {
    const testDir = path.join(process.cwd(), outputDir);
    await fs.promises.mkdir(testDir, { recursive: true });
    return testDir;
  } catch (error) {
    throw new TestGenerationError(
      'Failed to create output directory',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Generates test content using AI with templates
 */
async function generateTestContent(
  prompt: string,
  options: Required<TestGeneratorOptions>
): Promise<string> {
  try {
    const enhancedPrompt = `
      Generate a Playwright test for the following scenario:
      ${prompt}
      
      Requirements:
      - Use TypeScript
      - Include proper imports
      - Add meaningful assertions
      - Handle timeouts and errors
      - Add JSDoc documentation
      - Use page object patterns
      - Include test metadata (title, tags)
    `;

    const baseContent = await askAI(enhancedPrompt, options.temperature);
    if (!options.template) {
      return baseContent;
    }

    return options.template.replace('${TEST_CONTENT}', baseContent);
  } catch (error) {
    throw new TestGenerationError(
      'Failed to generate test content',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Validates test syntax and patterns
 */
function validateTestSyntax(content: string): string[] {
  const warnings: string[] = [];
  const checks: [RegExp, string][] = [
    [/import.*@playwright\/test/i, 'Missing Playwright test imports'],
    [/test\(['"].*['"]/i, 'No test function declarations found'],
    [/expect\(/i, 'No assertions found'],
    [/beforeAll|beforeEach|afterAll|afterEach/i, 'No test hooks found'],
    [/try\s*{.*}\s*catch/s, 'No error handling found'],
    [/\/\*\*[\s\S]*?\*\//i, 'Missing JSDoc documentation'],
    [/page\.[a-zA-Z]+/i, 'No page interactions found'],
    [/TODO|FIXME/i, 'Contains TODO comments'],
    [/await/i, 'No async/await usage found'],
    [/export/i, 'Test is not exported']
  ];

  for (const [pattern, message] of checks) {
    if (!pattern.test(content)) {
      warnings.push(message);
    }
  }

  return warnings;
}

/**
 * Formats the generated test code
 */
async function formatTestCode(content: string): Promise<string> {
  // Add proper imports and setup
  const header = `
    // @ts-check
    import { test, expect } from '@playwright/test';
    import { chromium, Browser, BrowserContext, Page } from '@playwright/test';
  `.trim() + '\n\n';

  // Format content
  const formatted = content
    .split('\n')
    .map(line => line.trimEnd()) // Remove trailing spaces
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // Remove extra blank lines
    .trim();

  return header + formatted + '\n';
}

/**
 * Writes the test file and metadata
 */
async function writeTestFile(
  testDir: string,
  testName: string,
  content: string,
  options: Required<TestGeneratorOptions>
): Promise<string> {
  try {
    // Create test file
    const testFilePath = path.join(testDir, `${testName}${options.fileExtension}`);
    await fs.promises.writeFile(testFilePath, content, 'utf-8');

    // Create metadata file
    const metadataPath = testFilePath + '.meta.json';
    const metadata = {
      generatedAt: new Date().toISOString(),
      options,
      stats: {
        lines: content.split('\n').length,
        size: Buffer.from(content).length
      }
    };
    await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    return testFilePath;
  } catch (error) {
    throw new TestGenerationError(
      'Failed to write test file',
      error instanceof Error ? error.message : String(error)
    );
  }
}
