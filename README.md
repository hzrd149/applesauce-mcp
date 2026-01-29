# Applesauce Examples MCP Server

An MCP (Model Context Protocol) server that provides semantic search over code
examples and documentation using LanceDB vector database and Ollama embeddings.

## Features

- **MCP Server**: Exposes tools for AI agents to search and retrieve example
  files and documentation
- **Vector Search**: Uses Ollama embeddings (nomic-embed-text) for semantic
  search
- **Hybrid Search**: Combines semantic and keyword matching for documentation
- **Metadata Extraction**: Automatically extracts imports, exports, functions,
  and dependencies
- **Dual Transport**: Supports both stdio (for MCP clients) and HTTP/SSE (for
  web clients)

## Prerequisites

1. **Ollama**: Must be running locally
   ```bash
   # Install Ollama from https://ollama.ai
   # Then pull the embedding model:
   ollama pull nomic-embed-text:v1.5
   ```

2. **Deno**: Install from https://deno.land

## Quick Start

1. **Create a `config.json` file:**
   ```json
   {
     "examplesFolder": "./path/to/your/examples"
   }
   ```

2. **Ingest your examples and documentation:**
   ```bash
   deno task ingest
   ```

3. **Start the MCP server:**
   ```bash
   # Stdio mode (default, for MCP clients)
   deno task start

   # HTTP/SSE mode (for web clients or testing)
   deno task start:http
   ```

## Available Tasks

| Task                   | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `deno task ingest`     | Index examples and documentation into the database   |
| `deno task start`      | Start MCP server in stdio mode (default)             |
| `deno task start:http` | Start MCP server with HTTP/SSE endpoint on port 3000 |
| `deno task dev`        | Start MCP server with MCP Inspector for debugging    |
| `deno task check`      | Run type checking                                    |

## Configuration

The `config.json` file should contain:

- `examplesFolder`: Path to the directory containing example files (relative or
  absolute)

See `config.json.example` for a template.

## Server Modes

The MCP server supports two transport modes:

### Stdio Mode (Default)

Standard mode for MCP clients that communicate via stdin/stdout:

```bash
deno task start
```

### HTTP/SSE Mode

Exposes the MCP server over HTTP with Server-Sent Events for real-time
communication. Useful for web clients and testing:

```bash
deno task start:http
```

This starts an HTTP server on `http://localhost:3000` with the following
endpoints:

- **`GET /sse`**: Server-Sent Events endpoint for receiving messages from the
  server
- **`POST /message`**: Send JSON-RPC messages to the server
- **`GET /health`**: Health check endpoint that returns server status and client
  count

**Custom Port:**

```bash
deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --allow-ffi src/cli.ts --http --port=8080
```

**Testing the HTTP endpoint:**

Open `test-sse-client.html` in a browser to test the HTTP/SSE endpoint
interactively, or run `./test-http-endpoint.sh` for curl-based testing.

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
│   │   └── mcp.ts          # MCP server command
│   └── lib/
│       ├── lancedb.ts       # LanceDB service (embeddings, examples, docs, hybrid search)
│       └── metadata.ts     # Code metadata extraction
├── scripts/
│   └── ingest.ts           # Ingest script (examples + docs)
├── data/
│   └── lancedb/            # LanceDB database files (created on first ingest)
├── config.json             # Configuration file
├── config.json.example     # Example configuration
├── deno.json               # Deno configuration
└── README.md               # This file
```

## Development

**Type checking:**

```bash
deno task check
```

**MCP Inspector (debugging):**

```bash
deno task dev
```

**Ingest options:**

```bash
# Ingest only examples
deno task ingest -- --examples-only

# Ingest only documentation
deno task ingest -- --docs-only

# Ingest specific documentation category
deno task ingest -- --docs-only --category=core
```

## License

MIT
