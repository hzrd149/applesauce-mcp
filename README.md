# Applesauce Examples MCP Server

A Deno CLI tool that indexes example files into a LanceDB vector database and
serves them via an MCP (Model Context Protocol) server for AI agent integration.

## Features

- **Ingest Command**: Scans a configured examples folder and indexes all
  TypeScript/JavaScript files with semantic embeddings
- **MCP Server**: Exposes tools for AI agents to search and retrieve example
  files
- **Vector Search**: Uses Ollama embeddings (nomic-embed-text) for semantic
  search
- **Metadata Extraction**: Automatically extracts imports, exports, functions,
  and dependencies

## Prerequisites

1. **Ollama**: Must be running locally
   ```bash
   # Install Ollama from https://ollama.ai
   # Then pull the embedding model:
   ollama pull nomic-embed-text:v1.5
   ```

2. **Deno**: Install from https://deno.land

## Setup

1. Create a `config.json` file:
   ```json
   {
     "examplesFolder": "./path/to/your/examples"
   }
   ```

2. Ingest your examples:
   ```bash
   deno task ingest
   ```

3. Start the MCP server:
   ```bash
   deno task mcp
   ```

## Configuration

The `config.json` file should contain:

- `examplesFolder`: Path to the directory containing example files (relative or
  absolute)

See `config.json.example` for a template.

## MCP Tools

The MCP server exposes three tools:

### 1. search_examples

Search for examples using natural language or keywords. Returns only basic
information (name, description, category) to help you identify relevant
examples. Use `get_example` to retrieve the full code.

**Parameters:**

- `query` (required): Search query
- `limit` (optional): Max results (default: 5)

**Returns:**

```json
[
  {
    "name": "casting/threads",
    "description": "Example showing how to work with threads",
    "category": "casting"
  }
]
```

**Example:**

```json
{
  "query": "async profile loading",
  "limit": 3
}
```

### 2. list_examples

List all available examples with their names and descriptions.

**Parameters:** None

### 3. get_example

Retrieve the full code and details for a specific example by name. Use this
after `search_examples` to get the actual code.

**Parameters:**

- `name` (required): Example name (file path without extension)

**Returns:**

```json
{
  "name": "casting/threads",
  "description": "Example showing how to work with threads",
  "category": "casting",
  "filePath": "casting/threads.tsx",
  "code": "// Full example code here...",
  "dependencies": ["applesauce-core", "react"]
}
```

**Example:**

```json
{
  "name": "casting/threads"
}
```

## Example Naming

Example names are the file path relative to the examples folder, minus the
extension:

- `casting/threads.tsx` → `casting/threads`
- `cache/window.nostrdb.tsx` → `cache/window.nostrdb`
- `simple.ts` → `simple`

## Project Structure

```
applesauce-mcp/
├── src/
│   ├── cli.ts              # Main CLI entry point
│   ├── types.ts            # Type definitions
│   ├── config.ts           # Config file loader
│   ├── commands/
│   │   ├── ingest.ts       # Ingest command
│   │   └── mcp.ts          # MCP server command
│   └── lib/
│       ├── database.ts     # LanceDB operations
│       ├── embeddings.ts   # Ollama embedding client
│       └── metadata.ts     # Code metadata extraction
├── data/
│   └── lancedb/            # LanceDB database files (created on first ingest)
├── config.json             # Configuration file
├── config.json.example     # Example configuration
├── deno.json               # Deno configuration
└── README.md               # This file
```

## Development

Run type checking:

```bash
deno task check
```

Watch mode:

```bash
deno task dev
```

## License

MIT
