# Applesauce MCP Server

An MCP (Model Context Protocol) tool designed to help AI agents build Nostr
applications using the [Applesauce SDK](https://github.com/hzrd149/applesauce).
This tool provides AI agents with semantic search capabilities over Applesauce's
documentation and code examples, enabling them to quickly find relevant
information, understand API usage patterns, and write correct code with fewer
mistakes.

By integrating this MCP server into your AI-powered IDE or coding assistant,
your agent gains instant access to comprehensive Applesauce documentation,
real-world code examples, and best practices—all searchable through natural
language queries. This significantly reduces hallucinations and helps agents
produce working Nostr applications faster.

## Prerequisites

### For Using the Public HTTP Endpoint

**No installation required!** Simply connect to
`https://mcp.applesauce.build/mcp`

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

For Claude Desktop, Cline, and other MCP-compatible tools, use this
configuration format:

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

Refer to your specific IDE's MCP configuration documentation for the exact file
location.

## Available MCP Tools

Once configured, your AI agent will have access to these 6 tools:

### Documentation Tools

**`search_docs`** - Semantically search Applesauce documentation using natural
language queries. Use this when you need to understand how a specific API works,
find usage patterns, or learn about Applesauce concepts.

- `query` (string, required): Natural language search query
- `limit` (number, optional): Max results, 1-20 (default: 5)

**`list_docs`** - List all available documentation files. Use this to explore
what documentation is available or to find the exact path of a documentation
file.

**`read_docs`** - Read the full content of a specific documentation file. Use
this after finding a relevant file through search or list to get complete
details.

- `path` (string, required): Documentation file path (e.g.,
  "core/EventStore.md")

### Example Code Tools

**`search_examples`** - Semantically search code examples using natural language
queries. Use this to find real-world code showing how to implement specific
features or use specific APIs.

- `query` (string, required): Natural language search query
- `limit` (number, optional): Max results, 1-20 (default: 5)

**`list_examples`** - List all available code examples. Use this to explore what
examples are available.

**`read_example`** - Read the full source code and metadata for a specific
example. Use this to get the complete implementation details after finding a
relevant example.

- `name` (string, required): Example name without extension (e.g.,
  "casting/threads")
- Returns: Full source code, imports, exports, functions, and dependencies

## Configuring Embeddings Provider

The MCP server supports multiple embeddings providers for semantic search. You can configure the provider using environment variables.

### Supported Providers

#### Ollama (Default)

No configuration needed - the server uses Ollama by default with the `qwen3-embedding:4b` model.

**Custom Ollama Configuration:**

```bash
export EMBEDDING_PROVIDER=ollama
export OLLAMA_HOST=http://localhost:11434  # Custom Ollama host
export EMBEDDING_MODEL=nomic-embed-text:latest  # Custom model
```

#### OpenAI

Use OpenAI's embedding models:

```bash
export EMBEDDING_PROVIDER=openai
export EMBEDDING_MODEL=text-embedding-3-small
export OPENAI_API_KEY=sk-your-api-key-here
# OPENAI_BASE_URL defaults to https://api.openai.com/v1
```

#### OpenAI-Compatible Providers

The server works with any OpenAI-compatible API (OpenRouter, Together.ai, Fireworks AI, etc.):

```bash
export EMBEDDING_PROVIDER=openai
export EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5  # Provider-specific model name
export OPENAI_API_KEY=sk-or-v1-your-api-key
export OPENAI_BASE_URL=https://openrouter.ai/api/v1
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EMBEDDING_PROVIDER` | Provider type (`ollama` or `openai`) | `ollama` |
| `EMBEDDING_MODEL` | Model name to use | `qwen3-embedding:4b` |
| `OLLAMA_HOST` | Ollama server URL (when using Ollama) | `http://localhost:11434` |
| `OPENAI_API_KEY` | API key for OpenAI-compatible providers | (required for OpenAI) |
| `OPENAI_BASE_URL` | Base URL for OpenAI-compatible APIs | `https://api.openai.com/v1` |

**Note:** When switching providers, you'll need to re-run `deno task cli ingest` to regenerate embeddings with the new provider.

## Running Locally

Most users will use the public HTTP endpoint
(`https://mcp.applesauce.build/mcp`) or run via JSR/Deno. However, if you want
to run the server locally:

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

## Running with Docker

The server includes Docker and Docker Compose configurations for easy deployment.

### Using Docker Compose (Recommended)

The default configuration uses Ollama for embeddings:

```bash
# Start both MCP server and Ollama
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Using OpenAI or OpenAI-compatible providers:**

Edit `docker-compose.yml` and update the environment variables:

```yaml
environment:
  - EMBEDDING_PROVIDER=openai
  - EMBEDDING_MODEL=text-embedding-3-small
  - OPENAI_API_KEY=sk-your-api-key-here
  # - OPENAI_BASE_URL=https://openrouter.ai/api/v1  # For OpenRouter, etc.
```

### Using Docker directly

```bash
# Build the image
docker build -t applesauce-mcp .

# Run with Ollama (requires Ollama running on host)
docker run -p 3000:3000 \
  -e EMBEDDING_PROVIDER=ollama \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  applesauce-mcp

# Run with OpenAI
docker run -p 3000:3000 \
  -e EMBEDDING_PROVIDER=openai \
  -e EMBEDDING_MODEL=text-embedding-3-small \
  -e OPENAI_API_KEY=sk-your-api-key-here \
  applesauce-mcp
```

## License

MIT
