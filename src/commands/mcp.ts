import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type Resource,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { type DocSearchParams, type SearchParams } from "../types.ts";
import {
  getExampleByName,
  getExampleCount,
  initDatabase,
  listAllExamples,
  searchExamples,
} from "../lib/database.ts";
import {
  getDocsStats,
  initDocsDatabase,
  listDocs,
  searchDocs,
  setHybridSearchConfig,
} from "../lib/database-docs.ts";
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
  {
    name: "search_docs",
    description:
      "Search Applesauce documentation using hybrid search (semantic + keyword matching). Returns formatted markdown with relevant documentation chunks and context.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query for documentation (e.g., 'How do I use EventStore?', 'RelayPool connection')",
        },
        limit: {
          type: "number",
          default: 10,
          description:
            "Maximum number of results to return (1-20, default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_doc_categories",
    description:
      "List all documentation categories with chunk counts. Useful for discovering what documentation is available.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "read_docs",
    description:
      "Read the full content of a documentation file. Use this after search_docs to get the complete documentation.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description:
            "File path from search results (e.g., 'core/event-store.md', 'loading/relays/pool.md')",
        },
      },
      required: ["filePath"],
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
 * Handle search_docs tool
 */
async function handleSearchDocs(args: unknown) {
  const params = args as DocSearchParams;

  if (!params.query || typeof params.query !== "string") {
    throw new Error("Missing required parameter: query");
  }

  // Generate embedding for the query
  const queryVector = await generateEmbedding(params.query);

  // Search documentation
  const results = await searchDocs(params, queryVector);

  // Format results as human/AI-friendly markdown
  const lines: string[] = [];
  lines.push(`# Documentation Search Results`);
  lines.push("");
  lines.push(`**Query:** ${params.query}`);
  lines.push(
    `**Results:** ${results.length} chunk${
      results.length !== 1 ? "s" : ""
    } found`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  for (let i = 0; i < results.length; i++) {
    const chunk = results[i];
    const score = (chunk as unknown as { _distance?: number })._distance ?? 0;
    const rank = i + 1;

    lines.push(`## Result ${rank}`);
    lines.push("");
    lines.push(`**File:** \`${chunk.filePath}\``);
    lines.push(`**Category:** ${chunk.metadata.category}`);
    lines.push(`**Relevance Score:** ${score.toFixed(4)} (lower is better)`);

    // Include headers if available
    if (
      Array.isArray(chunk.metadata.headers) &&
      chunk.metadata.headers.length > 0
    ) {
      lines.push(`**Section:** ${chunk.metadata.headers.join(" > ")}`);
    }

    lines.push("");
    lines.push("**Content:**");
    lines.push("");
    lines.push("```");
    // Include the full chunk text for better context
    lines.push(chunk.text);
    lines.push("```");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return {
    content: [
      {
        type: "text",
        text: lines.join("\n"),
      },
    ],
  };
}

/**
 * Handle list_doc_categories tool
 */
async function handleListDocCategories() {
  const stats = await getDocsStats();

  const categories = Object.entries(stats.categories).map(([name, count]) => ({
    category: name,
    chunkCount: count,
  }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            totalDocs: stats.docCount,
            totalChunks: stats.chunkCount,
            categories,
          },
          null,
          2,
        ),
      },
    ],
  };
}

/**
 * Handle read_docs tool
 */
async function handleReadDocs(args: unknown) {
  const { filePath } = args as { filePath: string };

  if (!filePath || typeof filePath !== "string") {
    throw new Error("Missing required parameter: filePath");
  }

  // Validate and read the file
  const DOCS_ROOT = "./reference/applesauce/apps/docs";
  const fullPath = `${DOCS_ROOT}/${filePath}`;

  try {
    // Security check: ensure path is within docs directory
    const { resolve } = await import("@std/path");
    const absolutePath = resolve(fullPath);
    const absoluteDocsRoot = resolve(DOCS_ROOT);

    if (!absolutePath.startsWith(absoluteDocsRoot)) {
      throw new Error(
        "Invalid file path: must be within documentation directory",
      );
    }

    // Read the file
    const content = await Deno.readTextFile(absolutePath);

    // Strip front-matter for cleaner output
    let textContent = content;
    const frontMatterRegex = /^---\n[\s\S]*?\n---\n/;
    if (frontMatterRegex.test(content)) {
      textContent = content.replace(frontMatterRegex, "");
    }

    return {
      content: [
        {
          type: "text",
          text: textContent,
        },
      ],
    };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { error: "Documentation file not found", filePath },
              null,
              2,
            ),
          },
        ],
      };
    }
    throw error;
  }
}

/**
 * Start the MCP server
 */
export async function mcpCommand(): Promise<void> {
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
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: { params: { name: string; arguments?: unknown } }) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "search_examples":
            return await handleSearchExamples(args);

          case "list_examples":
            return await handleListExamples();

          case "get_example":
            return await handleGetExample(args);

          case "search_docs":
            return await handleSearchDocs(args);

          case "list_doc_categories":
            return await handleListDocCategories();

          case "read_docs":
            return await handleReadDocs(args);

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

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
