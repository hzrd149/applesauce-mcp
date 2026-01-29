# Docker Setup for Applesauce MCP

This document describes how to run Applesauce MCP with Ollama using Docker Compose.

## Quick Start

```bash
# Build and start services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

## Services

### Ollama Service
- **Image**: `ollama/ollama:latest`
- **Port**: 11434
- **Volume**: `applesauce_ollama_data` (persists downloaded models)
- **Health Check**: Checks if Ollama API is responsive

### MCP Service
- **Image**: Built from `Dockerfile` (Deno + application code)
- **Port**: 3000
- **Volume**: `applesauce_mcp_data` (persists LanceDB and applesauce repo)
- **Environment**: `OLLAMA_HOST=http://ollama:11434`

## First Run

On the first startup, the MCP container will:

1. Clone the applesauce repository (`setup` command)
2. Ingest documentation and examples (`ingest` command)
3. Download the embedding model from Ollama (`qwen3-embedding:8b`)
4. Start the MCP HTTP server on port 3000

This process may take several minutes depending on your network connection.

## Usage

Once running, the MCP server is available at:

```
http://localhost:3000
```

### Testing the Server

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Test MCP server (example request)
curl http://localhost:3000
```

## Data Persistence

Both services use named volumes for persistence:

- `applesauce_ollama_data`: Stores Ollama models
- `applesauce_mcp_data`: Stores LanceDB database and applesauce repository

To remove all data:

```bash
docker compose down -v
```

## Configuration

### Change Ports

Edit `docker-compose.yml`:

```yaml
services:
  mcp:
    ports:
      - "8080:3000"  # Change host port to 8080
```

### Use Different Embedding Model

Edit `src/const.ts` before building:

```typescript
export const EMBEDDING_MODEL = "nomic-embed-text:v1.5";
```

Then rebuild:

```bash
docker compose build --no-cache
docker compose up -d
```

## Troubleshooting

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f mcp
docker compose logs -f ollama
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart mcp
```

### Reset Everything

```bash
# Stop and remove containers, volumes, and images
docker compose down -v
docker rmi applesauce-mcp-mcp

# Start fresh
docker compose up -d
```

### Check Container Status

```bash
docker compose ps
```

## Development

To rebuild after code changes:

```bash
# Rebuild and restart
docker compose up -d --build

# Or rebuild without cache
docker compose build --no-cache
docker compose up -d
```

## Environment Variables

Available environment variables for the MCP container:

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_HOST` | `http://ollama:11434` | Ollama API endpoint |

To override, edit `docker-compose.yml`:

```yaml
services:
  mcp:
    environment:
      - OLLAMA_HOST=http://custom-ollama:11434
```
