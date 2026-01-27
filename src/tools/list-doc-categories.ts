import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { getDocsStats } from "../lib/database-docs.ts";

/**
 * Tool definition
 */
export const listDocCategoriesTool: Tool = {
  name: "list_doc_categories",
  description:
    "List all documentation categories with chunk counts. Useful for discovering what documentation is available.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Tool handler
 */
export async function handleListDocCategories(): Promise<CallToolResult> {
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
