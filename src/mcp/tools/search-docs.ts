import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { getVectorStore } from "../../lib/lancedb.ts";
import { DOCS_TABLE_NAME } from "../../const.ts";

/**
 * Tool definition
 */
export const searchDocsTool: Tool = {
  name: "search_docs",
  description:
    "Search Applesauce documentation. Returns formatted markdown with relevant documentation.",
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
        default: 5,
        description: "Maximum number of results to return (1-20, default: 5)",
      },
    },
    required: ["query"],
  },
};

/**
 * Tool handler
 */
export async function handleSearchDocs(args: unknown): Promise<CallToolResult> {
  const params = args as { query: string; limit?: number };

  if (!params.query || typeof params.query !== "string") {
    throw new Error("Missing required parameter: query");
  }

  // Search documentation
  const store = await getVectorStore(DOCS_TABLE_NAME);
  const results = await store.similaritySearch(
    params.query,
    params.limit ?? 5,
  );

  // Format results as human/AI-friendly markdown
  const lines: string[] = [];

  for (const doc of results) {
    lines.push(`**Path:** ${doc.metadata.source}`);
    lines.push("");
    lines.push(doc.pageContent);
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
