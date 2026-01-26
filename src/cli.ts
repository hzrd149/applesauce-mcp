#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --allow-ffi

/**
 * CLI entry point for Applesauce Examples MCP Server
 */

import { ingestCommand } from "./commands/ingest.ts";
import { mcpCommand } from "./commands/mcp.ts";

const USAGE = `
Applesauce MCP Server

USAGE:
  deno task ingest        - Ingest both examples and documentation
  deno task mcp           - Start the MCP server

COMMANDS:
  ingest [OPTIONS]        Index example files and/or documentation
    --examples-only       Only ingest example files
    --docs-only           Only ingest documentation
    --category=NAME       Filter docs by category (e.g., core, loading)

  mcp                     Run the MCP server for AI agent integration

REQUIREMENTS:
  - Ollama must be running (http://localhost:11434)
  - nomic-embed-text model must be installed (ollama pull nomic-embed-text:v1.5)
  - config.json file with "examplesFolder" field

EXAMPLES:
  # Ingest everything (examples + docs)
  deno task ingest

  # Ingest only examples
  deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --allow-ffi src/cli.ts ingest --examples-only

  # Ingest only documentation
  deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --allow-ffi src/cli.ts ingest --docs-only

  # Ingest only core documentation
  deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --allow-ffi src/cli.ts ingest --docs-only --category=core

  # Start the MCP server
  deno task mcp

For more information, see README.md
`;

async function main() {
  const args = Deno.args;

  if (args.length === 0) {
    console.log(USAGE);
    Deno.exit(0);
  }

  const command = args[0];

  try {
    switch (command) {
      case "ingest": {
        // Parse options
        const examplesOnly = args.includes("--examples-only");
        const docsOnly = args.includes("--docs-only");
        const categoryArg = args.find((arg) => arg.startsWith("--category="));
        const category = categoryArg?.split("=")[1];

        // Determine what to ingest
        const options = {
          examples: examplesOnly ? true : !docsOnly,
          docs: docsOnly ? true : !examplesOnly,
          category,
        };

        await ingestCommand(options);
        break;
      }

      case "mcp":
        await mcpCommand();
        break;

      case "help":
      case "--help":
      case "-h":
        console.log(USAGE);
        break;

      default:
        console.error(`Unknown command: ${command}\n`);
        console.log(USAGE);
        Deno.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Error: ${message}\n`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    Deno.exit(1);
  }
}

// Only run main if this is the entry point
if (import.meta.main) {
  main();
}
