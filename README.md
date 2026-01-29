# Applesauce MCP Server

An MCP (Model Context Protocol) tool designed to help AI agents build Nostr applications using the [Applesauce SDK](https://github.com/hzrd149/applesauce). This tool provides AI agents with semantic search capabilities over Applesauce's documentation and code examples, enabling them to quickly find relevant information, understand API usage patterns, and write correct code with fewer mistakes.

By integrating this MCP server into your AI-powered IDE or coding assistant, your agent gains instant access to comprehensive Applesauce documentation, real-world code examples, and best practices—all searchable through natural language queries. This significantly reduces hallucinations and helps agents produce working Nostr applications faster.

## Prerequisites

### For Using the Public HTTP Endpoint

**No installation required!** Simply connect to `https://mcp.applesauce.build/mcp`

### For Running Locally (JSR/Deno or Cloned Repository)

1. **Ollama**: Must be running locally
   ```bash
   # Install Ollama from https://ollama.ai
   # The MCP server will automatically attempt to download the embedding model
   # Or you can manually download it:
   ollama pull nomic-embed-text:v1.5
   ```

2. **Deno**: Install from https://deno.land

## Adding to Your IDE or AI Assistant

### OpenCode

Add to `~/.config/opencode/opencode.json`:

**Using Public HTTP Endpoint (Easiest)**
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "applesauce": {
      "type": "remote",
      "url": "https://mcp.applesauce.build/mcp"
    }
  }
}
```

**Using JSR with Deno**
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "applesauce": {
      "type": "local",
      "command": ["deno", "run", "-P", "jsr:@applesauce/mcp"]
    }
  }
}
```

[Learn more about MCP in OpenCode](https://opencode.ai/docs/mcp-servers/)

### Cursor

Add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en-US/install-mcp?name=postgres&config=eyJjb21tYW5kIjoiZGVubyBydW4gLVAganNyOkBhcHBsZXNhdWNlL21jcCJ9)

**Using Public HTTP Endpoint (Easiest)**
```json
{
  "mcpServers": {
    "applesauce": {
      "url": "https://mcp.applesauce.build/mcp"
    }
  }
}
```

**Using JSR with Deno**
```json
{
  "mcpServers": {
    "applesauce": {
      "command": "deno",
      "args": ["run", "-P", "jsr:@applesauce/mcp"]
    }
  }
}
```

[Learn more about MCP in Cursor](https://cursor.com/docs/context/mcp)

### Other MCP-Compatible IDEs

For Claude Desktop, Cline, and other MCP-compatible tools, use this configuration format:

**Using Public HTTP Endpoint**
```json
{
  "mcpServers": {
    "applesauce": {
      "url": "https://mcp.applesauce.build/mcp"
    }
  }
}
```

**Using JSR with Deno**
```json
{
  "mcpServers": {
    "applesauce": {
      "command": "deno",
      "args": ["run", "-P", "jsr:@applesauce/mcp"]
    }
  }
}
```

Refer to your specific IDE's MCP configuration documentation for the exact file location.

## Available MCP Tools

Once configured, your AI agent will have access to these 6 tools:

### Documentation Tools

**`search_docs`** - Semantically search Applesauce documentation using natural language queries. Use this when you need to understand how a specific API works, find usage patterns, or learn about Applesauce concepts.
- `query` (string, required): Natural language search query
- `limit` (number, optional): Max results, 1-20 (default: 5)

**`list_docs`** - List all available documentation files. Use this to explore what documentation is available or to find the exact path of a documentation file.

**`read_docs`** - Read the full content of a specific documentation file. Use this after finding a relevant file through search or list to get complete details.
- `path` (string, required): Documentation file path (e.g., "core/EventStore.md")

### Example Code Tools

**`search_examples`** - Semantically search code examples using natural language queries. Use this to find real-world code showing how to implement specific features or use specific APIs.
- `query` (string, required): Natural language search query
- `limit` (number, optional): Max results, 1-20 (default: 5)

**`list_examples`** - List all available code examples. Use this to explore what examples are available.

**`read_example`** - Read the full source code and metadata for a specific example. Use this to get the complete implementation details after finding a relevant example.
- `name` (string, required): Example name without extension (e.g., "casting/threads")
- Returns: Full source code, imports, exports, functions, and dependencies

## How AI Agents Should Use These Tools

**Recommended workflow:**

1. **Search first** - Use `search_docs` or `search_examples` to find relevant information
2. **Read details** - Use `read_docs` or `read_example` to get the full content of relevant files
3. **Write code** - Use the information to write correct, working code

**Example scenario:**

**User:** "I need to create a Nostr event store that subscribes to relays"

**Agent workflow:**
1. `search_docs` with query: "EventStore relay subscription"
2. `read_docs` with path from search results
3. `search_examples` with query: "relay subscription event handling"
4. `read_example` with name from search results
5. Write the implementation using the documentation and example code as reference

This approach ensures the agent has accurate, up-to-date information about the Applesauce SDK before writing code.

## Running Locally

Most users will use the public HTTP endpoint (`https://mcp.applesauce.build/mcp`) or run via JSR/Deno. However, if you want to run the server locally:

### Setup and Run

```bash
# Clone the repository
git clone https://github.com/hzrd149/applesauce-mcp.git
cd applesauce-mcp

# Run the server (first run will automatically setup the database)
deno task cli

# Or run in HTTP mode
deno task cli -- --mode http --port 3000
```

The first time you run the server, it will automatically:
1. Clone the Applesauce repository to `data/applesauce/`
2. Extract and index all documentation and code examples
3. Generate embeddings for semantic search using Ollama

### Updating Data

To get the latest Applesauce documentation and examples:

```bash
# Update the repository
deno task cli update

# Re-index the data
deno task cli ingest
```

Or if running via JSR:

```bash
deno run -P jsr:@applesauce/mcp update
deno run -P jsr:@applesauce/mcp ingest
```

## License

MIT
