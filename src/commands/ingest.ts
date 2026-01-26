/**
 * Unified ingest command - Process and index both examples and documentation
 */

import { walk } from "@std/fs";
import { basename, relative, resolve } from "@std/path";
import { crypto } from "@std/crypto";
import { randomUUID } from "node:crypto";
import type { DocChunk, ExampleRecord } from "../types.ts";
import { extractMetadata } from "../lib/metadata.ts";
import {
  checkOllamaAvailable,
  createEmbeddingText,
  generateEmbedding,
  generateEmbeddingsBatch,
} from "../lib/embeddings.ts";
import {
  getExampleCount,
  initDatabase,
  upsertExample,
} from "../lib/database.ts";
import {
  deleteDocChunks,
  getDocsStats,
  initDocsDatabase,
  insertDocChunks,
} from "../lib/database-docs.ts";
import { SemanticChunker } from "../lib/chunker.ts";
import { loadConfig } from "../config.ts";

const DOCS_ROOT = "./reference/applesauce/apps/docs";

/**
 * Ingest options
 */
export interface IngestOptions {
  examples?: boolean; // Ingest examples
  docs?: boolean; // Ingest documentation
  category?: string; // Filter docs by category
}

/**
 * Generate a unique ID from file path
 */
async function generateId(filePath: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(filePath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return hashHex.substring(0, 16);
}

/**
 * Extract category from doc file path
 */
function extractCategory(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length === 1 || parts[0] === "index.md") {
    return "root";
  }
  return parts[0] ?? "other";
}

/**
 * Extract markdown headers from text
 */
function extractHeaders(text: string): string[] {
  const headerRegex = /^#+\s+(.+)$/gm;
  const headers: string[] = [];
  let match;

  while ((match = headerRegex.exec(text)) !== null) {
    headers.push(match[1]!.trim());
  }

  return headers;
}

// ============================================
// Examples Ingestion
// ============================================

/**
 * Process a single example file
 */
async function processExampleFile(
  absolutePath: string,
  relativePath: string,
): Promise<ExampleRecord> {
  const code = await Deno.readTextFile(absolutePath);
  const metadata = extractMetadata(relativePath, code);

  const embeddingText = createEmbeddingText(
    metadata.name,
    metadata.description,
    metadata.category,
    code,
  );
  const vector = await generateEmbedding(embeddingText);

  return {
    id: await generateId(relativePath),
    code,
    vector,
    name: metadata.name,
    description: metadata.description,
    extension: metadata.extension,
    category: metadata.category,
    filePath: relativePath,
    absolutePath,
    keywords: metadata.keywords,
    dependencies: metadata.dependencies,
  };
}

/**
 * Find all code files in examples directory
 */
async function findCodeFiles(baseDir: string): Promise<string[]> {
  const files: string[] = [];

  for await (
    const entry of walk(baseDir, {
      exts: ["ts", "tsx", "js", "jsx"],
      skip: [/node_modules/, /\.git/, /dist/, /build/],
    })
  ) {
    if (entry.isFile) {
      files.push(entry.path);
    }
  }

  return files;
}

/**
 * Ingest examples
 */
async function ingestExamples(config: any): Promise<{
  succeeded: number;
  failed: number;
  total: number;
}> {
  console.log("\n" + "=".repeat(60));
  console.log("📂 INGESTING EXAMPLES");
  console.log("=".repeat(60) + "\n");

  await initDatabase();

  const examplesPath = resolve(Deno.cwd(), config.examplesFolder);
  console.log(`Scanning: ${examplesPath}`);

  const files = await findCodeFiles(examplesPath);
  console.log(`Found ${files.length} code files\n`);

  if (files.length === 0) {
    console.log("⚠️  No code files found");
    return { succeeded: 0, failed: 0, total: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const absolutePath = files[i];
    const relativePath = relative(examplesPath, absolutePath);

    try {
      console.log(`[${i + 1}/${files.length}] ${relativePath}`);
      const record = await processExampleFile(absolutePath, relativePath);
      await upsertExample(record);
      console.log(`  ✓ Indexed: ${record.name}`);
      succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ Failed: ${message}`);
      failed++;
    }

    if (i < files.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return { succeeded, failed, total: files.length };
}

// ============================================
// Documentation Ingestion
// ============================================

/**
 * Ingest a single documentation file
 */
async function ingestDocFile(
  absolutePath: string,
  chunker: SemanticChunker,
): Promise<number> {
  const content = await Deno.readTextFile(absolutePath);
  const fileName = basename(absolutePath);
  const relativePath = relative(DOCS_ROOT, absolutePath);

  // Strip front-matter
  let textContent = content;
  const frontMatterRegex = /^---\n[\s\S]*?\n---\n/;
  if (frontMatterRegex.test(content)) {
    textContent = content.replace(frontMatterRegex, "");
  }

  const stats = await Deno.stat(absolutePath);
  const fileSize = stats.size;

  const category = extractCategory(relativePath);
  const headers = extractHeaders(textContent);

  // Chunk the text
  const embedder = {
    embed: generateEmbedding,
    embedBatch: generateEmbeddingsBatch,
  };
  const chunks = await chunker.chunkText(textContent, embedder);

  if (chunks.length === 0) {
    return 0;
  }

  // Generate embeddings
  const chunkTexts = chunks.map((c) => c.text);
  const embeddings = await generateEmbeddingsBatch(chunkTexts);

  // Create DocChunk records
  const docChunks: DocChunk[] = chunks.map((chunk, idx) => ({
    id: randomUUID(),
    filePath: relativePath,
    fileName,
    chunkIndex: chunk.index,
    text: chunk.text,
    vector: embeddings[idx]!,
    timestamp: new Date().toISOString(),
    metadata: {
      fileSize,
      category,
      headers,
    },
  }));

  await deleteDocChunks(relativePath);
  await insertDocChunks(docChunks);

  return chunks.length;
}

/**
 * Ingest documentation
 */
async function ingestDocs(options: {
  category?: string;
}): Promise<{
  filesProcessed: number;
  totalChunks: number;
  categories: Map<string, number>;
}> {
  console.log("\n" + "=".repeat(60));
  console.log("📚 INGESTING DOCUMENTATION");
  console.log("=".repeat(60) + "\n");

  await initDocsDatabase();

  const chunker = new SemanticChunker();

  // Find all markdown files
  const mdFiles: string[] = [];
  for await (
    const entry of walk(DOCS_ROOT, {
      exts: [".md"],
      includeDirs: false,
      followSymlinks: false,
    })
  ) {
    mdFiles.push(entry.path);
  }

  // Filter by category if specified
  let filesToProcess = mdFiles;
  if (options.category) {
    filesToProcess = mdFiles.filter((filePath) => {
      const relativePath = relative(DOCS_ROOT, filePath);
      const fileCategory = extractCategory(relativePath);
      return fileCategory === options.category;
    });

    if (filesToProcess.length === 0) {
      console.log(`⚠️  No files found in category: ${options.category}`);
      return { filesProcessed: 0, totalChunks: 0, categories: new Map() };
    }
  }

  console.log(`Found ${filesToProcess.length} markdown files\n`);

  let totalChunks = 0;
  const categories = new Map<string, number>();

  for (const filePath of filesToProcess) {
    try {
      const relativePath = relative(DOCS_ROOT, filePath);
      const chunkCount = await ingestDocFile(filePath, chunker);
      totalChunks += chunkCount;

      const category = extractCategory(relativePath);
      categories.set(category, (categories.get(category) ?? 0) + 1);

      console.log(`  ✓ ${relativePath} (${chunkCount} chunks)`);
    } catch (error) {
      const relativePath = relative(DOCS_ROOT, filePath);
      console.error(`  ✗ Failed to process ${relativePath}:`, error);
    }
  }

  return { filesProcessed: filesToProcess.length, totalChunks, categories };
}

// ============================================
// Unified Ingest Command
// ============================================

/**
 * Main unified ingest command
 */
export async function ingestCommand(options: IngestOptions): Promise<void> {
  console.log("\n🚀 Starting ingestion process...");

  // If no options specified, ingest both
  const shouldIngestExamples = options.examples ?? true;
  const shouldIngestDocs = options.docs ?? true;

  // Check Ollama availability
  console.log("\nChecking Ollama availability...");
  const ollamaAvailable = await checkOllamaAvailable();
  if (!ollamaAvailable) {
    console.error(
      "❌ Ollama is not running or nomic-embed-text model is not available.",
    );
    console.error(
      "\nPlease ensure Ollama is running and install the model with:",
    );
    console.error("  ollama pull nomic-embed-text:v1.5\n");
    Deno.exit(1);
  }
  console.log("✓ Ollama is ready");

  // Load config
  const config = await loadConfig();

  // Track overall stats
  let examplesStats = { succeeded: 0, failed: 0, total: 0 };
  let docsStats = {
    filesProcessed: 0,
    totalChunks: 0,
    categories: new Map<string, number>(),
  };

  // Ingest examples
  if (shouldIngestExamples) {
    examplesStats = await ingestExamples(config);
  }

  // Ingest documentation
  if (shouldIngestDocs) {
    docsStats = await ingestDocs({ category: options.category });
  }

  // Overall Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 INGESTION SUMMARY");
  console.log("=".repeat(60));

  if (shouldIngestExamples) {
    const totalCount = await getExampleCount();
    console.log("\nExamples:");
    console.log(`  Succeeded:  ${examplesStats.succeeded}`);
    console.log(`  Failed:     ${examplesStats.failed}`);
    console.log(`  Total:      ${examplesStats.total}`);
    console.log(`  DB Count:   ${totalCount}`);
  }

  if (shouldIngestDocs) {
    const stats = await getDocsStats();
    console.log("\nDocumentation:");
    console.log(`  Files:      ${docsStats.filesProcessed}`);
    console.log(`  Chunks:     ${docsStats.totalChunks}`);
    console.log(`  DB Docs:    ${stats.docCount}`);
    console.log(`  DB Chunks:  ${stats.chunkCount}`);

    if (docsStats.categories.size > 0) {
      console.log("\n  Categories:");
      for (
        const [category, count] of Array.from(docsStats.categories.entries())
          .sort()
      ) {
        console.log(`    ${category.padEnd(20)} ${count} files`);
      }
    }
  }

  console.log("=".repeat(60) + "\n");

  if (examplesStats.failed > 0) {
    console.log("⚠️  Some files failed to process. See errors above.");
  } else {
    console.log("✅ Ingestion completed successfully!");
  }
}
