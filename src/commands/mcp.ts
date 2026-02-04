import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { isApplesauceRepoValid, updateApplesauceRepo } from "../lib/git.ts";
import { areAllTablesIngested } from "../lib/lancedb.ts";
import * as logger from "../lib/logger.ts";
import createApplesauceMCPServer from "../mcp/server.ts";
import { runSetup } from "./setup.ts";
import { rebuildDocs, rebuildExamples, rebuildMethods } from "./rebuild.ts";

export interface MCPCommandOptions {
  mode?: "stdio" | "http";
  port?: number;
  update?: boolean;
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
  } else if (options.update) {
    // Run update sequence if --update flag is provided
    logger.log("Updating applesauce repository...");
    const result = await updateApplesauceRepo();
    logger.log(result.message);

    if (result.success && result.hasChanges) {
      // Only rebuild if there were actual changes pulled
      logger.log("Rebuilding databases with updated content...");
      try {
        await rebuildDocs();
        await rebuildExamples();
        await rebuildMethods();
        logger.log("✓ Databases rebuilt successfully");
      } catch (error) {
        logger.error(
          "⚠ Failed to rebuild databases:",
          error instanceof Error ? error.message : error,
        );
        logger.warn(
          "Continuing with old data. Run 'applesauce-mcp rebuild' to retry.",
        );
      }
    } else if (result.success && !result.hasChanges) {
      logger.log("No changes detected, skipping database rebuild");
    } else {
      logger.warn("Update failed. Continuing with existing data.");
    }
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
