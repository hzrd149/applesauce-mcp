import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { resolve } from "@std/path";

/**
 * Tool definition
 */
export const readDocsTool: Tool = {
  name: "read_docs",
  description:
    "Read the full content of a documentation file. Use this after search_docs to get the complete documentation.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description:
          "File path from search results (e.g., 'core/event-store.md', 'loading/relays/pool.md')",
      },
    },
    required: ["filePath"],
  },
};

/**
 * Tool handler
 */
export async function handleReadDocs(args: unknown): Promise<CallToolResult> {
  const { filePath } = args as { filePath: string };

  if (!filePath || typeof filePath !== "string") {
    throw new Error("Missing required parameter: filePath");
  }

  // Validate and read the file
  const DOCS_ROOT = "./reference/applesauce/apps/docs";
  const fullPath = `${DOCS_ROOT}/${filePath}`;

  try {
    // Security check: ensure path is within docs directory
    const absolutePath = resolve(fullPath);
    const absoluteDocsRoot = resolve(DOCS_ROOT);

    if (!absolutePath.startsWith(absoluteDocsRoot)) {
      throw new Error(
        "Invalid file path: must be within documentation directory",
      );
    }

    // Read the file
    const content = await Deno.readTextFile(absolutePath);

    // Strip front-matter for cleaner output
    let textContent = content;
    const frontMatterRegex = /^---\n[\s\S]*?\n---\n/;
    if (frontMatterRegex.test(content)) {
      textContent = content.replace(frontMatterRegex, "");
    }

    return {
      content: [
        {
          type: "text",
          text: textContent,
        },
      ],
    };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { error: "Documentation file not found", filePath },
              null,
              2,
            ),
          },
        ],
      };
    }
    throw error;
  }
}
