/**
 * Centralized configuration constants for Applesauce MCP
 */

/** Repository management */
export const APPLESAUCE_REPO_URL = "https://github.com/hzrd149/applesauce";
export const APPLESAUCE_LOCAL_PATH = Deno.env.get("APPLESAUCE_REPO_PATH") ||
  "./data/applesauce";

/** Documentation and examples paths */
export const DOCS_ROOT = `${APPLESAUCE_LOCAL_PATH}/apps/docs`;
export const EXAMPLES_ROOT =
  `${APPLESAUCE_LOCAL_PATH}/apps/examples/src/examples`;

/** Database configuration */
export const DB_PATH = "./data";

/** Embeddings provider configuration */
export const EMBEDDING_PROVIDER = Deno.env.get("EMBEDDING_PROVIDER") ||
  "ollama";
export const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") ||
  "nomic-embed-text:v1.5";

/** Ollama-specific configuration */
export const OLLAMA_HOST = Deno.env.get("OLLAMA_HOST") ||
  "http://localhost:11434";

/** OpenAI-compatible configuration (OpenAI, OpenRouter, etc.) */
export const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
export const OPENAI_BASE_URL = Deno.env.get("OPENAI_BASE_URL") ||
  "https://api.openai.com/v1";

/** Ingestion configuration (docs only; examples are read from filesystem) */
export const DOCS_CHUNK_SIZE = 1000;
export const DOCS_CHUNK_OVERLAP = 200;
export const EXAMPLES_CHUNK_SIZE = 2000;
export const EXAMPLES_CHUNK_OVERLAP = 200;

/** Database table names */
export const DOCS_TABLE_NAME = "docs";
export const EXAMPLES_TABLE_NAME = "examples";
export const METHODS_TABLE_NAME = "methods";
