import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { type SearchParams } from "../types.ts";
import { searchExamples } from "../lib/database.ts";
import { generateEmbedding } from "../lib/embeddings.ts";

/**
 * Tool definition
 */
export const searchExamplesTool: Tool = {
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
};

/**
 * Tool handler
 */
export async function handleSearchExamples(
  args: unknown,
): Promise<CallToolResult> {
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
