import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { listDocs } from "../../lib/docs.ts";

/**
 * Tool definition
 */
export const listDocsTool: Tool = {
  name: "list_docs",
  description:
    "List all available documentation pages from the applesauce docs. Use read_doc with an id to read a page.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Tool handler
 */
export async function handleListDocs(): Promise<CallToolResult> {
  try {
    const docs = await listDocs();
    const formattedResults = docs.map((doc) => ({
      id: doc.id,
      category: doc.category,
      title: doc.title,
      description: doc.description,
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
