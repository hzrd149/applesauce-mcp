import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { getExampleByName } from "../lib/database.ts";

/**
 * Tool definition
 */
export const getExampleTool: Tool = {
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
};

/**
 * Tool handler
 */
export async function handleGetExample(args: unknown): Promise<CallToolResult> {
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
