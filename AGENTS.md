# Agent Development Guide

This document provides coding agents with essential information about the codebase structure, development commands, and style guidelines.

## Project Overview

**Applesauce MCP** is a Deno-based Model Context Protocol (MCP) server that provides semantic search over code examples using LanceDB and Ollama embeddings. The project includes a reference monorepo as a git submodule (`reference/applesauce/`).

### Project Structure

```
applesauce-mcp/              # Main Deno project
├── src/
│   ├── cli.ts               # CLI entry point
│   ├── types.ts             # Type definitions
│   ├── config.ts            # Configuration loader
│   ├── commands/            # Command implementations
│   └── lib/                 # Core libraries (database, embeddings, metadata)
├── data/lancedb/            # Database storage (gitignored)
├── reference/applesauce/    # Git submodule: Node.js/pnpm monorepo
└── deno.json                # Deno configuration

reference/applesauce/        # Reference monorepo (submodule)
├── packages/                # 13 packages (wallet, signers, relay, react, etc.)
├── apps/                    # 3 apps (docs, examples, snippets)
└── pnpm-workspace.yaml      # pnpm workspace config
```

## Build, Test, and Lint Commands

### Main Project (Deno)

```bash
# Development and running
deno task dev              # Run MCP server with inspector
deno task ingest           # Ingest example files (with --watch)
deno task mcp              # Start MCP server (with --watch)
deno task check            # Type checking

# Git submodule management
deno task submodule:init   # Initialize git submodules
deno task submodule:update # Update submodules
deno task submodule:sync   # Sync submodules

# Formatting (using Deno's built-in formatter)
deno fmt                   # Format all files
deno fmt --check           # Check formatting without writing

# Linting (using Deno's built-in linter)
deno lint                  # Lint all files
deno lint --fix            # Auto-fix linting issues

# Testing (not yet implemented)
# When adding tests, use: deno test --allow-read --allow-write --allow-net
```

## Code Style Guidelines

### File Organization

- **File naming**: Use kebab-case (e.g., `database.ts`, `embeddings.ts`)
- **Function naming**: camelCase with descriptive names
- **Type naming**: PascalCase for interfaces/types (e.g., `ExampleRecord`, `SearchParams`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `DB_PATH`, `TABLE_NAME`, `EMBEDDING_MODEL`)
- **Directory structure**: Feature-based organization (commands/, lib/, types.ts at root)

### Imports

**Main Project (Deno)**:
- Always use `.ts` file extensions in relative imports
- Import from Deno standard library via JSR: `@std/path`, `@std/fs`, `@std/crypto`
- Use named imports (no default exports)
- Group imports: standard library → external packages → relative imports

```typescript
// Standard library imports
import { walk } from "@std/fs";
import { relative, resolve } from "@std/path";

// External package imports
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

// Relative imports with .ts extension
import { type ExampleRecord } from "../types.ts";
import { initDatabase } from "./lib/database.ts";
```

**Reference Monorepo (Node.js)**:
- Use `.js` file extensions in imports (TypeScript NodeNext module resolution)
- Leverage barrel exports via `index.ts` files
- Use type-only imports when appropriate: `import { type Foo } from "./bar.js"`

```typescript
// Type-only imports
import { type IAsyncEventStoreActions } from "applesauce-core";

// Regular imports
import { makeAuthEvent } from "nostr-tools/nip42";
import { BehaviorSubject, Observable } from "rxjs";
```

### TypeScript and Types

- **Strict mode**: Always enabled (`"strict": true`)
- **Explicit types**: Prefer explicit return types on functions
- **Type-only imports**: Use `import { type Foo }` when importing only types
- **No `any`**: Avoid `any` types; use `unknown` if type is truly unknown
- **Interfaces vs Types**: Use `interface` for object shapes, `type` for unions/utilities

```typescript
/** JSDoc comment describing the function */
export async function searchExamples(
  params: SearchParams,
  queryVector: number[],
): Promise<ExampleRecord[]> {
  // Implementation
}
```

### Error Handling

**MCP Tool Errors**: Return error objects, don't throw

```typescript
try {
  // Tool implementation
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}
```

### Comments and Documentation

- Use JSDoc style for file headers and exported functions
- Include parameter descriptions for complex functions
- Add inline comments for non-obvious logic
- Keep comments concise and up-to-date

```typescript
/**
 * Search examples using vector similarity and optional filters
 *
 * @param params - Search parameters (query, limit)
 * @param queryVector - Pre-computed embedding vector for the query
 * @returns Array of matching example records
 */
export async function searchExamples(
  params: SearchParams,
  queryVector: number[],
): Promise<ExampleRecord[]> {
  // Implementation
}
```

## CLI Usage and Cliffy

This project uses [Cliffy](https://cliffy.dev/) for building the CLI. When extending commands:
- Use Cliffy's command parsing for robust argument handling
- Provide clear help text and examples
- Validate inputs early with helpful error messages

## Dependencies

**Main Project**:
- Deno standard library (`@std/*`)
- Cliffy CLI framework (`@cliffy/*`)
- MCP SDK (`@modelcontextprotocol/sdk`)
- LanceDB (`@lancedb/lancedb`)
- Ollama embeddings (`ollama`)
