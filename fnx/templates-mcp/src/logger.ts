/**
 * Logger for MCP server.
 * - debug/info: Only logged when MCP_DEBUG=1 or MCP_DEBUG=true
 * - warn/error/security: Always logged to stderr
 * - All output is structured JSON for log aggregation tools
 */

const DEBUG_ENV_VAR = 'MCP_DEBUG';

export function isDebugEnabled(): boolean {
  const value = process.env[DEBUG_ENV_VAR];
  return value === '1' || value === 'true';
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'security';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

function formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (context) {
    entry.context = context;
  }
  return JSON.stringify(entry);
}

export function debug(message: string, context?: Record<string, unknown>): void {
  if (isDebugEnabled()) {
    console.error(formatMessage('debug', message, context));
  }
}

export function info(message: string, context?: Record<string, unknown>): void {
  if (isDebugEnabled()) {
    console.error(formatMessage('info', message, context));
  }
}

/** Warning messages - always logged to stderr */
export function warn(message: string, context?: Record<string, unknown>): void {
  console.error(formatMessage('warn', message, context));
}

/** Error messages - always logged to stderr */
export function error(message: string, context?: Record<string, unknown>): void {
  console.error(formatMessage('error', message, context));
}

/** Security events (path traversal attempts, invalid inputs) - always logged to stderr */
export function security(message: string, context?: Record<string, unknown>): void {
  console.error(formatMessage('security', message, context));
}

export const logger = {
  isDebugEnabled,
  debug,
  info,
  warn,
  error,
  security,
};
