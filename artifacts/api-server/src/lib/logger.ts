import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

// Better Stack: ship error-level logs to the configured source. Token is
// set as a Replit secret. Endpoint defaults to the EU ingest host (matches
// the source we created in the dashboard). Override with
// BETTER_STACK_ENDPOINT if your source uses a different region.
const betterStackToken = process.env.BETTER_STACK_SOURCE_TOKEN;
const betterStackEndpoint =
  process.env.BETTER_STACK_ENDPOINT ?? "https://in.logs.betterstack.com";

// Build the pino transport set:
//   - dev: pino-pretty for terminal-friendly output, plus Better Stack if a
//     token is set (so dev errors are still captured during testing).
//   - prod: stdout JSON (no pino-pretty), plus Better Stack.
// Each target gets its own `level` so Better Stack only ingests `error` and
// above — keeping ingest costs predictable while pino-pretty / stdout still
// show full info-level output locally and in container logs.
const targets: pino.TransportTargetOptions[] = [];

if (!isProduction) {
  targets.push({
    target: "pino-pretty",
    level: process.env.LOG_LEVEL ?? "info",
    options: { colorize: true },
  });
}

if (betterStackToken) {
  targets.push({
    target: "@logtail/pino",
    level: "error",
    options: {
      sourceToken: betterStackToken,
      options: { endpoint: betterStackEndpoint },
    },
  });
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(targets.length > 0 ? { transport: { targets } } : {}),
});
