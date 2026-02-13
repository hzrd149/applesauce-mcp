# Agent Development Guide

This document provides coding agents with essential information about the
codebase structure, development commands, and style guidelines.

## Project Overview

**Applesauce MCP** is a Deno-based Model Context Protocol (MCP) server that
provides semantic search over code examples and documentation using LanceDB
vector database and Ollama embeddings. The CLI tool automatically manages a
local clone of the applesauce repository in an OS-specific cache directory.

### Project Structure

```
applesauce-mcp/              # Main Deno project
├── src/
│   ├── cli.ts               # CLI entry point (Cliffy-based)
│   ├── const.ts             # Configuration constants
│   ├── types.ts             # Type definitions
│   ├── commands/            # Command implementations
│   │   ├── setup.ts         # Clone applesauce repo
│   │   ├── update.ts        # Update applesauce repo
│   │   ├── rebuild.ts       # Rebuild examples and docs databases
│   │   └── mcp.ts           # MCP server (stdio/HTTP)
│   ├── lib/                 # Core libraries
│   │   ├── lancedb.ts       # LanceDB service (connection, embeddings, examples, docs, hybrid search)
│   │   ├── metadata.ts      # Code metadata extraction
│   │   ├── git.ts           # Git operations
│   │   ├── logger.ts        # Logging utilities
│   │   └── cache.ts         # OS-specific cache directory utilities
│   ├── loaders/             # Custom document loaders
│   └── tools/               # MCP tools (search, read, list)
└── deno.json                # Deno configuration
```

## Build, Test, and Lint Commands

### Development Commands

```bash
# Setup and initialization
deno task cli setup        # Clone applesauce repo to OS-specific cache directory
deno task cli update       # Pull latest changes and automatically rebuild databases
deno task cli update --skip-rebuild  # Update without rebuilding
deno task cli rebuild      # Manually rebuild documentation and examples databases from scratch

# Running the MCP server
deno task dev              # Run MCP server with MCP Inspector
deno task cli              # Run CLI (default: start stdio server)
deno task cli -- --mode http --port 8080  # HTTP mode on custom port

# Type checking
deno task check            # Type check src/cli.ts entry point

# Formatting (Deno's built-in)
deno fmt                   # Format all TypeScript files
deno fmt --check           # Check formatting without writing
deno fmt src/              # Format only src/ directory

# Linting (Deno's built-in)
deno lint                  # Lint all files
deno lint --fix            # Auto-fix linting issues

# Testing
deno test                                        # Run all tests
deno test src/lib/database.test.ts              # Run single test file
deno test --allow-read --allow-write --allow-net # With permissions
```

## Data Storage

The MCP server stores data in OS-appropriate cache directories:

- **Linux**: `~/.cache/applesauce-mcp/`
- **macOS**: `~/Library/Caches/applesauce-mcp/`
- **Windows**: `%LOCALAPPDATA%\applesauce-mcp\`

Inside the cache directory:
- `applesauce/` - Cloned Applesauce repository
- `*.lance/` - LanceDB vector databases (docs, examples, methods)

**Custom Paths**: Override using environment variables:
- `APPLESAUCE_REPO_PATH` - Custom repository location
- `APPLESAUCE_DB_PATH` - Custom database location

These are particularly useful for Docker deployments where you may want to mount
volumes at specific paths.

## Code Style Guidelines

### File Organization

- **File naming**: kebab-case (e.g., `lancedb.ts`, `metadata.ts`)
- **Function naming**: camelCase with descriptive names
- **Type naming**: PascalCase (e.g., `ExampleRecord`, `SearchParams`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `DB_PATH`, `EMBEDDING_MODEL`)
- **Directory structure**: Feature-based (commands/, lib/, tools/)

### Imports

Always use `.ts` extensions in relative imports. Group imports in order:

1. Deno standard library (`@std/*`)
2. External packages (npm/JSR)
3. Relative imports

```typescript
// Deno standard library (JSR imports)
import { walk } from "@std/fs";
import { resolve } from "@std/path";

// External packages
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import ollama from "ollama";

// Relative imports with .ts extension
import { type ExampleRecord } from "../types.ts";
import { initDatabase } from "./lib/lancedb.ts";
```

**Type-only imports**: Use `type` keyword when importing only types

```typescript
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type SearchParams } from "../types.ts";
```

### TypeScript and Types

- **Strict mode**: Always enabled in `deno.json`
- **Explicit return types**: Required for exported functions
- **No `any`**: Use `unknown` for truly unknown types
- **Interfaces vs Types**: `interface` for object shapes, `type` for unions

```typescript
/**
 * Search examples using vector similarity
 *
 * @param params - Search parameters (query, limit)
 * @param queryVector - Pre-computed embedding vector
 * @returns Array of matching example records
 */
export async function searchExamples(
  params: SearchParams,
  queryVector: number[],
): Promise<ExampleRecord[]> {
  // Implementation
}
```

### Error Handling

**General errors**: Throw descriptive errors with context

```typescript
if (!db) {
  throw new Error("Database not initialized. Call initDatabase() first.");
}
```

**MCP tool errors**: Return error objects with `isError: true` (don't throw)

```typescript
try {
  // Tool implementation
} catch (error) {
  if (error instanceof Deno.errors.NotFound) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: "File not found" }, null, 2),
      }],
    };
  }
  throw error; // Re-throw unexpected errors
}
```

### Comments and Documentation

- **File headers**: JSDoc comment at top of file
- **Exported functions**: JSDoc with `@param` and `@returns`
- **Inline comments**: For non-obvious logic only
- **Constants**: Explain purpose and constraints

```typescript
/**
 * Ollama embedding client using the official ollama package
 *
 * Recommended models:
 * - nomic-embed-text (best for code/text, 768 dims)
 * - all-minilm (lightweight, 384 dims)
 */

// Use nomic-embed-text as recommended for semantic search
const EMBEDDING_MODEL = "nomic-embed-text:v1.5";
```

## CLI Development with Cliffy

This project uses [Cliffy](https://cliffy.dev/) for the CLI. When adding
commands:

- Use `.command()` method to register subcommands
- Use `.option()` for flags with type validation
- Use `.action()` for command handlers
- Provide `.example()` for usage examples
- Use `EnumType` for restricted option values

```typescript
const modeType = new EnumType(["stdio", "http"]);

await new Command()
  .type("mode", modeType)
  .option("--mode <mode:mode>", "Server mode", { default: "stdio" })
  .option("--port <port:number>", "Port for HTTP", { default: 3000 })
  .example("HTTP mode", "applesauce-mcp --mode http --port 8080")
  .action(async ({ mode, port }) => {
    await startServer({ mode, port });
  })
  .parse(Deno.args);
```

## Key Dependencies

- **Deno standard library**: `@std/path`, `@std/fs`, `@std/crypto`
- **Cliffy**: CLI framework (`@cliffy/command`, `@cliffy/flags`)
- **MCP SDK**: `@modelcontextprotocol/sdk` (server, transports, types)
- **LanceDB**: `@lancedb/lancedb` (vector database)
- **Ollama**: `ollama` (embedding generation)
- **LangChain**: `@langchain/*` (document loading, text splitting)
- **Hono**: `hono` (HTTP server for MCP over HTTP)
- **Zod**: `zod` (schema validation)
