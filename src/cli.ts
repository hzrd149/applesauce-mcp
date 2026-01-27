#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --allow-ffi

/**
 * CLI entry point for Applesauce MCP Server
 *
 * This is the main MCP server executable. For ingesting data, use:
 *   deno task ingest
 */

import { mcpCommand, type MCPCommandOptions } from "./commands/mcp.ts";
import * as logger from "./lib/logger.ts";

const USAGE = `
Applesauce MCP Server

USAGE:
  applesauce-mcp [OPTIONS]

OPTIONS:
  --http                Start HTTP/SSE server instead of stdio (default: stdio)
  --port=PORT           Port for HTTP server (default: 3000)
  --help, -h            Show this help message

EXAMPLES:
  # Start the MCP server (stdio mode, default)
  applesauce-mcp

  # Start the MCP server (HTTP/SSE mode on port 3000)
  applesauce-mcp --http

  # Start the MCP server (HTTP/SSE mode on custom port)
  applesauce-mcp --http --port=8080

For more information, see README.md
`;

const args = Deno.args;

// Show help if requested
if (args.includes("--help") || args.includes("-h")) {
  logger.log(USAGE);
  Deno.exit(0);
}

try {
  // Parse MCP options
  const httpMode = args.includes("--http");
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const port = portArg ? parseInt(portArg.split("=")[1], 10) : 3000;

  const mcpOptions: MCPCommandOptions = {
    mode: httpMode ? "http" : "stdio",
    port,
  };

  await mcpCommand(mcpOptions);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`\n❌ Error: ${message}\n`);
  if (error instanceof Error && error.stack) {
    logger.error(error.stack);
  }
  Deno.exit(1);
}
