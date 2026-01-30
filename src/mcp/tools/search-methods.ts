import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { getVectorStore } from "../../lib/lancedb.ts";
import { METHODS_TABLE_NAME } from "../../const.ts";

/**
 * Tool definition
 */
export const searchMethodsTool: Tool = {
  name: "search_methods",
  description:
    "Search exported methods, functions, classes, types, and interfaces from Applesauce packages. Returns methods with their import paths, documentation, and usage information.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Search query describing the functionality you need (e.g., 'parse nostr event', 'create relay pool', 'validate signature')",
      },
      limit: {
        type: "number",
        default: 10,
        description: "Maximum number of results to return (1-20, default: 10)",
      },
    },
    required: ["query"],
  },
};

/**
 * Tool handler
 */
export async function handleSearchMethods(
  args: unknown,
): Promise<CallToolResult> {
  const params = args as { query: string; limit?: number };

  if (!params.query || typeof params.query !== "string") {
    throw new Error("Missing required parameter: query");
  }

  const limit = Math.min(Math.max(params.limit ?? 10, 1), 20);

  // Search methods
  const store = await getVectorStore(METHODS_TABLE_NAME);
  const results = await store.similaritySearch(params.query, limit);

  // Format results as structured text
  const lines: string[] = [];
  lines.push(`Found ${results.length} method(s):`);
  lines.push("");

  for (let i = 0; i < results.length; i++) {
    const doc = results[i];
    const metadata = doc.metadata;

    lines.push(`## ${i + 1}. ${metadata.methodName || "Unknown"}`);
    lines.push("");

    // Show the full content (includes documentation)
    lines.push(doc.pageContent);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  if (results.length === 0) {
    lines.push("No methods found matching your query.");
    lines.push("");
    lines.push("Try:");
    lines.push(
      "- Using more general terms (e.g., 'event' instead of 'handleEvent')",
    );
    lines.push("- Describing the functionality you need");
    lines.push(
      "- Checking if the methods have been rebuilt with `rebuild methods`",
    );
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
