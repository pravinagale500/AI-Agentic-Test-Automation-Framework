import express from "express";
import type { Request, Response } from "express";
import path from "path";
import bodyParser from "body-parser";
import { spawn, ChildProcess } from "child_process";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import { createLogger, format, transports } from "winston";

// Load environment variables
dotenv.config();

// Define interfaces
interface SSEClient extends Response {
  isAlive?: boolean;
}

interface RunRequest {
  prompt: string;
  tag: string;
  env?: string;
}

interface ErrorResponse {
  error: string;
  details?: unknown;
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
    new transports.File({ filename: 'combined.log' })
  ]
});

// Initialize Express app
const app = express();
const publicDir = path.join(process.cwd(), "src", "server", "public");

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env['CORS_ORIGIN'] || '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(express.static(publicDir));

// Store SSE clients
const clients = new Set<SSEClient>();
const activeProcesses = new Set<ChildProcess>();

// Health check for clients
setInterval(() => {
  clients.forEach(client => {
    if (client.isAlive === false) {
      clients.delete(client);
      return;
    }
    client.isAlive = false;
    client.write(': ping\n\n');
  });
}, 30000);

// SSE endpoint
app.get("/events", (req: Request, res: SSEClient) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.write('\n');
  res.isAlive = true;
  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
    logger.info('Client disconnected');
  });
});

// Run test endpoint
app.post("/run", (req: Request<{}, any, RunRequest>, res: Response): Response | void => {
  try {
    const { prompt, tag, env } = req.body;

    if (!prompt || !tag) {
      const error: ErrorResponse = { error: "Missing required fields" };
      if (!prompt) error.details = "prompt is required";
      if (!tag) error.details = "tag is required";
      return res.status(400).json(error);
    }

    if (env) {
      if (!["qa", "uat", "prod"].includes(env)) {
        return res.status(400).json({
          error: "Invalid environment",
          details: `env must be one of: qa, uat, prod`
        });
      }
      process.env['ENV'] = env;
    }

    const args = ["run", "ai:run", tag];
    const child = spawn("npm", args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    activeProcesses.add(child);

    child.stdout.on("data", (data) => {
      broadcast(String(data));
      logger.debug(String(data));
    });

    child.stderr.on("data", (data) => {
      const error = String(data);
      broadcast(`ERROR: ${error}`);
      logger.error(error);
    });

    child.on("close", (code) => {
      const message = `Process exited with code ${code}`;
      broadcast(message);
      logger.info(message);
      activeProcesses.delete(child);
    });

    res.json({ status: "started", tag });
  } catch (error) {
    logger.error('Error in /run endpoint:', error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Broadcast message to all connected clients
function broadcast(message: string): void {
  const formattedMessage = `data: ${message.trim()}\n\n`;
  clients.forEach(client => {
    try {
      client.write(formattedMessage);
    } catch (error) {
      logger.error('Error broadcasting to client:', error);
      clients.delete(client);
    }
  });
}

// Graceful shutdown
function gracefulShutdown(signal: string) {
  return () => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    // Close all client connections
    clients.forEach(client => {
      try {
        client.end();
      } catch (error) {
        logger.error('Error closing client connection:', error);
      }
    });
    clients.clear();

    // Terminate all child processes
    activeProcesses.forEach(process => {
      try {
        process.kill();
      } catch (error) {
        logger.error('Error terminating child process:', error);
      }
    });
    activeProcesses.clear();

    // Exit process
    process.exit(0);
  };
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown('SIGTERM'));
process.on('SIGINT', gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException')();
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  gracefulShutdown('unhandledRejection')();
});

// Start server
const port = process.env['PORT'] || 3333;
app.listen(port, () => {
  logger.info(`Web UI running at http://localhost:${port}`);
});
