import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { type SearchParams } from "../types.ts";
import {
  getExampleByName,
  getExampleCount,
  initDatabase,
  listAllExamples,
  searchExamples,
} from "../lib/database.ts";
import { generateEmbedding } from "../lib/embeddings.ts";

/**
 * Define available MCP tools
 */
const TOOLS: Tool[] = [
  {
    name: "search_examples",
    description:
      "Search example files semantically or by filters. Returns relevant examples with code content.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural language search query or keywords to find relevant examples",
        },
        limit: {
          type: "number",
          default: 5,
          description: "Maximum number of results to return (default: 5)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_examples",
    description:
      "List all available example files. Returns the names and descriptions of all examples in the database.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_example",
    description:
      "Retrieve a specific example file by its name. The name should be the file path without extension (e.g., 'casting/threads').",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Example name (file path without extension, e.g., 'casting/threads')",
        },
      },
      required: ["name"],
    },
  },
];

/**
 * Handle search_examples tool
 */
async function handleSearchExamples(args: unknown) {
  const params = args as SearchParams;

  // Validate required parameter
  if (!params.query || typeof params.query !== "string") {
    throw new Error("Missing required parameter: query");
  }

  // Generate embedding for the query
  const queryVector = await generateEmbedding(params.query);

  // Search database
  const results = await searchExamples(params, queryVector);

  // Format results - only return name, description, and category
  const formattedResults = results.map((example) => ({
    name: example.name,
    description: example.description,
    category: example.category,
  }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(formattedResults, null, 2),
      },
    ],
  };
}

/**
 * Handle list_examples tool
 */
async function handleListExamples() {
  const allExamples = await listAllExamples();

  // Format results with just name and description
  const formattedResults = allExamples.map((example) => ({
    name: example.name,
    description: example.description,
    category: example.category,
  }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(formattedResults, null, 2),
      },
    ],
  };
}

/**
 * Handle get_example tool
 */
async function handleGetExample(args: unknown) {
  const { name } = args as { name: string };

  if (!name || typeof name !== "string") {
    throw new Error("Missing required parameter: name");
  }

  const example = await getExampleByName(name);

  if (!example) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "Example not found", name }, null, 2),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: example.code,
      },
    ],
  };
}

/**
 * Start the MCP server
 */
export async function mcpCommand(): Promise<void> {
  // Initialize database
  await initDatabase();

  // Create MCP server
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
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "search_examples":
          return await handleSearchExamples(args);

        case "list_examples":
          return await handleListExamples();

        case "get_example":
          return await handleGetExample(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
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
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
