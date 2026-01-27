import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  CallToolResult,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type Resource,
} from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  initDocsDatabase,
  setHybridSearchConfig,
} from "../lib/database-docs.ts";
import {
  getExampleByName,
  initDatabase,
  listAllExamples,
} from "../lib/database.ts";
import * as logger from "../lib/logger.ts";
import {
  getExampleTool,
  handleGetExample,
  handleListDocCategories,
  handleListExamples,
  handleReadDocs,
  handleSearchDocs,
  handleSearchExamples,
  listDocCategoriesTool,
  listExamplesTool,
  readDocsTool,
  searchDocsTool,
  searchExamplesTool,
} from "../tools/index.ts";

/**
 * All available MCP tools
 */
const TOOLS = {
  "search_examples": searchExamplesTool,
  "list_examples": listExamplesTool,
  "get_example": getExampleTool,
  "search_docs": searchDocsTool,
  "list_doc_categories": listDocCategoriesTool,
  "read_docs": readDocsTool,
} as const;

const TOOL_HANDLERS: Record<
  keyof typeof TOOLS,
  (args: unknown) => Promise<CallToolResult>
> = {
  "search_examples": handleSearchExamples,
  "list_examples": handleListExamples,
  "get_example": handleGetExample,
  "search_docs": handleSearchDocs,
  "list_doc_categories": handleListDocCategories,
  "read_docs": handleReadDocs,
} as const;

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

  // Initialize databases
  await initDatabase();
  await initDocsDatabase();

  // Configure hybrid search (weight: 0.6, candidateMultiplier: 2)
  setHybridSearchConfig(0.6, 2);

  // Create MCP server
  const server = new Server(
    {
      name: "applesauce-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: Object.values(TOOLS),
  }));

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const handler = TOOL_HANDLERS[name as keyof typeof TOOL_HANDLERS];
        if (!handler) {
          throw new Error(`Unknown tool: ${name}`);
        }

        return await handler(args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: message }, null, 2),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Register resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const allExamples = await listAllExamples();

    const resources: Resource[] = allExamples.map((example) => ({
      uri: `applesauce://example/${example.name}`,
      name: example.name,
      description: example.description || `Example: ${example.name}`,
      mimeType: "text/typescript",
    }));

    return { resources };
  });

  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: { params: { uri: string } }) => {
      const { uri } = request.params;

      // Extract example name from URI (applesauce://example/casting/thread)
      const prefix = "applesauce://example/";
      if (!uri.startsWith(prefix)) {
        throw new Error(`Invalid resource URI: ${uri}`);
      }

      const exampleName = uri.slice(prefix.length);
      const example = await getExampleByName(exampleName);

      if (!example) {
        throw new Error(`Example not found: ${exampleName}`);
      }

      return {
        contents: [
          {
            uri,
            mimeType: "text/typescript",
            text: example.code,
          },
        ],
      };
    },
  );

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
