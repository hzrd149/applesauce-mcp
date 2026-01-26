/**
 * Core types for the example files MCP server
 */

/** An example file record stored in LanceDB */
export interface ExampleRecord {
  // Core content
  id: string; // Unique identifier (hash of file path)
  code: string; // The actual file content
  vector: number[]; // Embedding vector (768 dimensions for nomic-embed-text)

  // Metadata
  name: string; // Example name (file path without extension, e.g., "casting/threads")
  description: string; // Human-readable description
  extension: string; // File extension

  // Context metadata
  category: string; // Example category (extracted from path)
  filePath: string; // Relative file path from examples root
  absolutePath: string; // Absolute file path

  // Search optimization
  keywords: string[]; // Extracted technical terms
  dependencies: string[]; // NPM packages or imports used
}

/** Metadata extracted from a code file */
export interface ExtractedMetadata {
  name: string;
  description: string;
  extension: string;
  category: string;
  keywords: string[];
  dependencies: string[];
}

/** Search parameters for examples */
export interface SearchParams {
  query: string;
  limit?: number;
}

/**
 * Document chunk record stored in LanceDB
 */
export interface DocChunk {
  id: string; // UUID
  filePath: string; // Relative to docs root
  fileName: string; // File name
  chunkIndex: number; // Chunk number (0-based)
  text: string; // Chunk content
  vector: number[]; // Embedding vector
  timestamp: string; // ISO 8601
  metadata: {
    fileSize: number;
    category: string; // Inferred from path (core, loading, etc.)
    headers: string[]; // Markdown headers in chunk
  };
}

/**
 * Document search result (includes score)
 */
export interface DocSearchResult extends DocChunk {
  _distance?: number; // Relevance score from vector search
}

/**
 * Text chunk (intermediate representation)
 */
export interface TextChunk {
  text: string;
  index: number;
}

/**
 * Semantic chunker configuration
 */
export interface ChunkerConfig {
  hardThreshold: number; // Default: 0.6
  initConst: number; // Default: 1.5
  c: number; // Default: 0.9
  minChunkLength: number; // Default: 50
}

/**
 * Doc search parameters
 */
export interface DocSearchParams {
  query: string;
  limit?: number; // Default: 10
}

/**
 * Embedder interface for generating embeddings
 */
export interface EmbedderInterface {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/** Configuration file structure */
export interface Config {
  examplesFolder: string;
  chunker: {
    hardThreshold: number;
    initConst: number;
    c: number;
    minChunkLength: number;
  };
  hybridSearch: {
    weight: number; // Keyword boost factor
    candidateMultiplier: number; // Fetch multiplier for reranking
  };
}
