/**
 * Custom document loader for example files with TypeScript frontmatter
 * Extracts frontmatter metadata and uses it as the document content for embeddings
 */

import { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import { Document } from "@langchain/core/documents";
import path from "node:path";
import {
  frontmatterToSearchableText,
  parseFrontmatter,
} from "../lib/ts-frontmatter.ts";

/**
 * Loads TypeScript example files and extracts frontmatter
 * Only the frontmatter metadata is used for embeddings, not the code itself
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

    // Parse the frontmatter
    const { frontmatter } = parseFrontmatter(content);
    const hasFrontMatter = frontmatter !== null;

    // Convert frontmatter to searchable text (this is what gets embedded)
    const searchableText = frontmatterToSearchableText(
      frontmatter || {},
      relativePath,
    );

    // Create document with frontmatter as the page content
    // The actual code is NOT included in the embedding
    const doc = new Document({
      id: relativePath,
      pageContent: searchableText,
      metadata: {
        source: relativePath,
        title: frontmatter?.title || "",
        description: frontmatter?.description || "",
        tags: frontmatter?.tags || [],
        related: frontmatter?.related || [],
        hasFrontMatter,
      },
    });

    return [doc];
  }
}
