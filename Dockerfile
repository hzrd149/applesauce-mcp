FROM denoland/deno:2.6.7

# Install git for cloning applesauce repo (setup/ingest)
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Clone applesauce repo to /opt (outside of /app to avoid volume conflicts)
RUN git clone https://github.com/hzrd149/applesauce.git /opt/applesauce

# Copy dependency files first for better caching
COPY deno.json deno.lock* ./

# Cache dependencies
RUN deno install

# Copy source code
COPY . .

# Create data directory for LanceDB
RUN mkdir -p /app/data

# Environment variables for embeddings configuration
# These can be overridden at runtime with docker run -e
ENV EMBEDDING_PROVIDER=ollama
ENV EMBEDDING_MODEL=qwen3-embedding:4b
ENV OLLAMA_HOST=http://host.docker.internal:11434
ENV OPENAI_API_KEY=""
ENV OPENAI_BASE_URL=https://api.openai.com/v1

# Set custom applesauce repo path (pre-cloned at build time)
ENV APPLESAUCE_REPO_PATH=/opt/applesauce

# Expose HTTP port
EXPOSE 3000

# Default command: run MCP server in HTTP mode
CMD ["deno", "run", "-P", "src/cli.ts", "--mode", "http", "--port", "3000"]
