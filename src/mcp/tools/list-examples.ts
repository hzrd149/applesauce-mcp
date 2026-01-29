import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { listExamples } from "../../lib/examples.ts";

/**
 * Tool definition
 */
export const listExamplesTool: Tool = {
  name: "list_examples",
  description:
    "List all available example files from the applesauce repo. Returns names and descriptions.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Tool handler
 */
export async function handleListExamples(): Promise<CallToolResult> {
  try {
    const examples = await listExamples();
    const formattedResults = examples.map((ex) => ({
      name: ex.name,
      description: ex.description,
    }));

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
