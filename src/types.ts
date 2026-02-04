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
