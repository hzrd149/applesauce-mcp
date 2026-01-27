import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { type DocSearchParams } from "../types.ts";
import { searchDocs } from "../lib/database-docs.ts";
import { generateEmbedding } from "../lib/embeddings.ts";

/**
 * Tool definition
 */
export const searchDocsTool: Tool = {
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
        description: "Maximum number of results to return (1-20, default: 10)",
      },
    },
    required: ["query"],
  },
};

/**
 * Tool handler
 */
export async function handleSearchDocs(args: unknown): Promise<CallToolResult> {
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
