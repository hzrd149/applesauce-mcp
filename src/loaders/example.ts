/**
 * Custom document loader for example files with JSDoc metadata
 * Extracts JSDoc metadata and uses it as the document content for embeddings
 */

import { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import { Document } from "@langchain/core/documents";
import path from "node:path";
import {
  metadataToSearchableText,
  parseMetadata,
} from "../lib/jsdoc-metadata.ts";

/**
 * Loads TypeScript example files and extracts JSDoc metadata
 * Only the JSDoc metadata is used for embeddings, not the code itself
 */
export class ExampleLoader extends BaseDocumentLoader {
  private filePath: string;
  private baseDir?: string;

  constructor(filePath: string, baseDir?: string) {
    super();
    this.filePath = filePath;
    this.baseDir = baseDir;
  }

  async load(): Promise<Document[]> {
    // Read the file
    const content = await Deno.readTextFile(this.filePath);

    // Get relative path for metadata
    const relativePath = this.baseDir
      ? path.relative(this.baseDir, this.filePath)
      : this.filePath;

    // Parse the JSDoc metadata
    const { metadata } = parseMetadata(content);
    const hasMetadata = metadata !== null;

    // Convert metadata to searchable text (this is what gets embedded)
    const searchableText = metadataToSearchableText(
      metadata || {},
      relativePath,
    );

    // Create document with metadata as the page content
    // The actual code is NOT included in the embedding
    const doc = new Document({
      id: relativePath,
      pageContent: searchableText,
      metadata: {
        source: relativePath,
        description: metadata?.description || "",
        tags: metadata?.tags || [],
        related: metadata?.related || [],
        hasMetadata,
      },
    });

    return [doc];
  }
}
