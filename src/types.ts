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

/** Configuration file structure */
export interface Config {
  examplesFolder: string;
}
