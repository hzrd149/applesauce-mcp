/**
 * Logger utility that respects MCP stdio mode
 * In stdio mode, we must not write to stdout/stderr to avoid corrupting the MCP protocol
 */

let silentMode = false;

/**
 * Set whether logging should be silent (used in stdio mode)
 */
export function setSilentMode(silent: boolean): void {
  silentMode = silent;
}

/**
 * Log an informational message (uses stdout)
 */
export function log(...args: unknown[]): void {
  if (!silentMode) {
    console.log(...args);
  }
}

/**
 * Log an error message (uses stderr)
 */
export function error(...args: unknown[]): void {
  if (!silentMode) {
    console.error(...args);
  }
}

/**
 * Log a warning message (uses stderr)
 */
export function warn(...args: unknown[]): void {
  if (!silentMode) {
    console.warn(...args);
  }
}

/**
 * Log debug information (uses stderr)
 */
export function debug(...args: unknown[]): void {
  if (!silentMode) {
    console.debug(...args);
  }
}

/**
 * Log informational message (uses stderr)
 */
export function info(...args: unknown[]): void {
  if (!silentMode) {
    console.info(...args);
  }
}
