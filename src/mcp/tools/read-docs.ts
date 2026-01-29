import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { readDoc } from "../../lib/docs.ts";

/**
 * Tool definition
 */
export const readDocTool: Tool = {
  name: "read_doc",
  description:
    "Read the full content of a documentation page by its id (no .md extension). Use after search_docs or list_doc to get the complete documentation.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "Document id relative to docs root without .md extension (e.g. 'core/event-store', 'loading/relays/pool'). Use ids from list_doc or search_docs.",
      },
    },
    required: ["id"],
  },
};

/**
 * Tool handler
 */
export async function handleReadDoc(args: unknown): Promise<CallToolResult> {
  const { id } = args as { id: string };

  if (!id || typeof id !== "string") {
    throw new Error("Missing required parameter: id");
  }

  const doc = await readDoc(id);

  if (!doc) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { error: "Documentation file not found", id },
            null,
            2,
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: doc.text,
      },
    ],
  };
}
