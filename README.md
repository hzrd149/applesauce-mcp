# Applesauce MCP Server

An MCP (Model Context Protocol) server that provides semantic search over
[Applesauce](https://github.com/coracle-social/applesauce) code examples and
documentation using LanceDB vector database and Ollama embeddings.

## Prerequisites

1. **Ollama**: Must be running locally with the embedding model
   ```bash
   # Install Ollama from https://ollama.ai
   # Then pull the embedding model:
   ollama pull nomic-embed-text:v1.5
   ```

2. **Deno**: Install from https://deno.land

## Installation

### Option 1: Quick Setup (Recommended)

Clone and set up everything in one command:

```bash
git clone https://github.com/YOUR_USERNAME/applesauce-mcp.git
cd applesauce-mcp
deno task cli setup
```

This will:
1. Clone the applesauce repository to `data/applesauce/`
2. Ingest documentation and examples into the vector database
3. Set up everything needed to run the MCP server

### Option 2: Manual Setup

```bash
# 1. Clone this repository
git clone https://github.com/YOUR_USERNAME/applesauce-mcp.git
cd applesauce-mcp

# 2. Clone the applesauce repository
deno task cli setup

# 3. Update applesauce repo (optional, if already cloned)
deno task cli update

# 4. Ingest documentation and examples
deno task cli ingest
```

## Running the MCP Server

### Stdio Mode (Default)

For MCP clients that communicate via stdin/stdout:

```bash
deno task cli
```

### HTTP Mode

For web clients or testing with HTTP/SSE:

```bash
deno task cli -- --mode http --port 3000
```

Endpoints available:
- `GET /sse` - Server-Sent Events endpoint
- `POST /message` - Send JSON-RPC messages
- `GET /health` - Health check

### Development Mode

Run with MCP Inspector for debugging:

```bash
deno task dev
```

## MCP Tools

The server exposes 6 tools for searching and retrieving Applesauce documentation
and examples:

### Documentation Tools

#### 1. `search_docs`

Search Applesauce documentation using semantic vector search.

**Parameters:**
- `query` (required): Search query (e.g., "How do I use EventStore?")
- `limit` (optional): Max results, 1-20 (default: 5)

**Returns:** Formatted markdown with relevant documentation chunks

#### 2. `list_docs`

List all available documentation files with their paths and descriptions.

**Parameters:** None

**Returns:** Array of documentation files with metadata

#### 3. `read_docs`

Read full content of a specific documentation file.

**Parameters:**
- `path` (required): Documentation file path (e.g., "core/EventStore.md")

**Returns:** Complete documentation file content

### Example Code Tools

#### 4. `search_examples`

Search example code files using semantic vector search.

**Parameters:**
- `query` (required): Search query (e.g., "async profile loading")
- `limit` (optional): Max results, 1-20 (default: 5)

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

#### 5. `list_examples`

List all available example files.

**Parameters:** None

**Returns:** Array of example files with names and descriptions

#### 6. `read_example`

Read full code and metadata for a specific example.

**Parameters:**
- `name` (required): Example name (path without extension, e.g., "casting/threads")

**Returns:**
```json
{
  "name": "casting/threads",
  "description": "Example showing how to work with threads",
  "category": "casting",
  "filePath": "casting/threads.tsx",
  "code": "// Full example code...",
  "imports": [...],
  "exports": [...],
  "functions": [...],
  "dependencies": [...]
}
```

## Configuration

### Updating the Repository

Keep the applesauce repository up to date:

```bash
deno task cli update
```

### Re-ingesting Data

After updating the repository or when documentation/examples change:

```bash
# Ingest everything
deno task cli ingest

# Ingest only documentation
deno task cli ingest -- --docs-only

# Ingest only examples
deno task cli ingest -- --examples-only
```

## Using with MCP Clients

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "applesauce": {
      "command": "deno",
      "args": [
        "run",
        "--allow-read",
        "--allow-write",
        "--allow-net",
        "--allow-env",
        "--allow-sys",
        "--allow-ffi",
        "--allow-run",
        "/path/to/applesauce-mcp/src/cli.ts"
      ]
    }
  }
}
```

## Example Workflow

```bash
# 1. Initial setup
deno task cli setup

# 2. Start the MCP server
deno task cli

# 3. In your MCP client, you can now:
#    - Search docs: "How do I use RelayPool?"
#    - Search examples: "Show me thread examples"
#    - Read specific files: read_example("casting/threads")

# 4. Keep it updated
deno task cli update
deno task cli ingest
```

## License

MIT
