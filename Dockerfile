# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Runtime image
#
# Uses the Debian (glibc) image because several native npm packages
# (@lancedb/lancedb, apache-arrow) ship glibc-linked binaries that require
# libc.so, which is absent on Alpine/musl.
# ─────────────────────────────────────────────────────────────────────────────
FROM denoland/deno:debian

# Install git for cloning the applesauce repo (setup/rebuild)
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifest and source for caching
COPY deno.json ./
COPY mod.ts ./
COPY src/ ./src/

# Warm the Deno module cache
RUN deno cache src/cli.ts

# Data volume — applesauce repo and LanceDB databases. Mounted at runtime.
VOLUME ["/data"]

# Set default data paths to /data volume
ENV APPLESAUCE_REPO_PATH=/data/applesauce
ENV APPLESAUCE_DB_PATH=/data

EXPOSE 3000

ENTRYPOINT ["deno", "task", "start"]
CMD ["--port", "3000", "--update"]
