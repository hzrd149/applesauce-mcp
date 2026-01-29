import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { isApplesauceRepoValid } from "../lib/git.ts";
import { areAllTablesIngested } from "../lib/lancedb.ts";
import * as logger from "../lib/logger.ts";
import createApplesauceMCPServer from "../mcp/server.ts";
import { runSetup } from "./setup.ts";

export interface MCPCommandOptions {
  mode?: "stdio" | "http";
  port?: number;
}

/**
 * Start the MCP server
 */
export async function mcpCommand(
  options: MCPCommandOptions = {},
): Promise<void> {
  const mode = options.mode || "stdio";
  const port = options.port || 3000;

  // Set silent mode for stdio to prevent corrupting MCP protocol
  logger.setSilentMode(mode === "stdio");

  // Check if repository exists and all tables are ingested
  const repoValid = await isApplesauceRepoValid();
  const tablesIngested = await areAllTablesIngested();

  if (!repoValid || !tablesIngested) {
    if (!repoValid) {
      logger.warn("Repository not set up.");
    }
    if (!tablesIngested) {
      logger.warn("Database tables not ingested (docs, examples, methods).");
    }
    logger.warn("Running setup to clone repository and ingest data...");
    await runSetup();
  }

  // Create MCP server
  const server = createApplesauceMCPServer();

  // Start server with appropriate transport
  if (mode === "http") {
    logger.log(`🚀 Starting MCP server on http://localhost:${port}`);
    logger.log(`   MCP endpoint: http://localhost:${port}/mcp`);
    logger.log(`   Health check: http://localhost:${port}/health`);

    const transport = new WebStandardStreamableHTTPServerTransport();
    await server.connect(transport);

    // Create Hono app
    const app = new Hono();

    // Enable CORS for Streamable HTTP (GET/POST/DELETE, MCP headers)
    app.use(
      "*",
      cors({
        origin: "*",
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: [
          "Content-Type",
          "mcp-session-id",
          "Last-Event-ID",
          "mcp-protocol-version",
        ],
        exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
      }),
    );

    app.all("/mcp", async (c) => {
      return await transport.handleRequest(c.req.raw);
    });

    // Start HTTP server
    Deno.serve({
      port,
      onListen: ({ hostname, port }) => {
        logger.log(`✅ Server listening on http://${hostname}:${port}`);
      },
    }, app.fetch);
  } else {
    // Default: stdio transport
    logger.error("🚀 Starting MCP server with stdio transport");
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
