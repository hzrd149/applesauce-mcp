import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  handleListDocs,
  handleListExamples,
  handleReadDoc,
  handleReadExample,
  handleSearchDocs,
  handleSearchExamples,
  handleSearchMethods,
  listDocsTool,
  listExamplesTool,
  readDocTool,
  readExampleTool,
  searchDocsTool,
  searchExamplesTool,
  searchMethodsTool,
} from "./tools/index.ts";

/**
 * All available MCP tools
 */
const TOOLS = {
  "search_examples": searchExamplesTool,
  "list_examples": listExamplesTool,
  "read_example": readExampleTool,
  "search_docs": searchDocsTool,
  "list_docs": listDocsTool,
  "read_doc": readDocTool,
  "search_methods": searchMethodsTool,
} as const;

const TOOL_HANDLERS: Record<
  keyof typeof TOOLS,
  (args: unknown) => Promise<CallToolResult>
> = {
  "search_examples": handleSearchExamples,
  "list_examples": handleListExamples,
  "read_example": handleReadExample,
  "search_docs": handleSearchDocs,
  "list_docs": handleListDocs,
  "read_doc": handleReadDoc,
  "search_methods": handleSearchMethods,
} as const;

export default function createApplesauceMCPServer(): Server {
  const server = new Server(
    {
      name: "applesauce-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
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

  return server;
}
