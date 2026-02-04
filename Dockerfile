FROM denoland/deno:2.6.7

# Install git for cloning applesauce repo (setup/rebuild)
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency files first for better caching
COPY deno.json deno.lock* ./

# Cache dependencies
RUN deno install

# Copy source code
COPY . .

# Create data directory for LanceDB
RUN mkdir -p /app/data

# Expose HTTP port
EXPOSE 3000

# Default command: run MCP server in HTTP mode
CMD ["deno", "run", "-P", "src/cli.ts", "--mode", "http", "--port", "3000", "--update"]
