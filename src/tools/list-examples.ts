import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { listAllExamples } from "../lib/database.ts";

/**
 * Tool definition
 */
export const listExamplesTool: Tool = {
  name: "list_examples",
  description:
    "List all available example files. Returns the names and descriptions of all examples in the database.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Tool handler
 */
export async function handleListExamples(): Promise<CallToolResult> {
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
