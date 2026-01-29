import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  CallToolResult,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type Resource,
} from "@modelcontextprotocol/sdk/types.js";
import { listExamples, readExample } from "../lib/examples.ts";
import {
  handleListDocs,
  handleListExamples,
  handleReadDoc,
  handleReadExample,
  handleSearchDocs,
  handleSearchExamples,
  listDocsTool,
  listExamplesTool,
  readDocTool,
  readExampleTool,
  searchDocsTool,
  searchExamplesTool,
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

  // Register resource handlers (examples from repo filesystem, not LanceDB)
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const allExamples = await listExamples();

    const resources: Resource[] = allExamples.map((example) => ({
      uri: `applesauce://example/${example.name}`,
      name: `example/${example.name}`,
      description: example.description || `Example: ${example.name}`,
      mimeType: "application/x-typescript",
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
      const example = await readExample(exampleName);

      if (!example) {
        throw new Error(`Example not found: ${exampleName}`);
      }

      return {
        contents: [
          {
            uri,
            mimeType: "application/x-typescript",
            text: example.code,
          },
        ],
      };
    },
  );

  return server;
}
