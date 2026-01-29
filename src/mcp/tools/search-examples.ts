import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { EXAMPLES_TABLE_NAME } from "../../const.ts";
import { getVectorStore } from "../../lib/lancedb.ts";

/** Derive category from source path (e.g. "casting/threads.ts" -> "casting"). */
function categoryFromSource(source: string | undefined): string {
  if (!source || typeof source !== "string") return "unknown";
  const parts = source.replace(/\\/g, "/").split("/");
  return parts.length > 1 ? parts[0] : "unknown";
}

/** Derive example name from source (path without extension, e.g. "casting/threads"). */
function nameFromSource(
  source: string | undefined,
  pageContent: string,
): string {
  if (source && typeof source === "string") {
    return source.replace(/\.[^.]+$/, "").replace(/\\/g, "/");
  }
  return pageContent.slice(0, 80).trim() || "unknown";
}

/**
 * Tool definition
 */
export const searchExamplesTool: Tool = {
  name: "search_examples",
  description:
    "Search example files semantically using pre-computed embeddings. Returns relevant examples with name, description snippet, and category.",
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
  const params = args as { query: string; limit?: number };

  if (!params.query || typeof params.query !== "string") {
    throw new Error("Missing required parameter: query");
  }

  const limit = Math.min(Math.max(params.limit ?? 5, 1), 20);

  try {
    const vectorStore = await getVectorStore(EXAMPLES_TABLE_NAME);
    const docs = await vectorStore.similaritySearch(params.query, limit);

    const formattedResults = docs.map((doc) => {
      const source = doc.metadata?.source as string | undefined;
      return {
        name: nameFromSource(source, doc.pageContent),
        description: doc.pageContent.slice(0, 200).trim(),
        category: categoryFromSource(source),
      };
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(formattedResults, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { error: (error as Error).message },
            null,
            2,
          ),
        },
      ],
    };
  }
}
