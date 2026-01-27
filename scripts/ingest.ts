#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --allow-ffi

/**
 * Ingest script – index example files and documentation.
 * Run via: deno task ingest
 */

import { walk } from "@std/fs";
import { basename, relative, resolve } from "@std/path";
import { crypto } from "@std/crypto";
import { randomUUID } from "node:crypto";
import type { DocChunk, ExampleRecord } from "../src/types.ts";
import { extractMetadata } from "../src/lib/metadata.ts";
import {
  checkOllamaAvailable,
  createEmbeddingText,
  generateEmbedding,
  generateEmbeddingsBatch,
} from "../src/lib/embeddings.ts";
import {
  getExampleCount,
  initDatabase,
  upsertExample,
} from "../src/lib/database.ts";
import {
  deleteDocChunks,
  getDocsStats,
  initDocsDatabase,
  insertDocChunks,
} from "../src/lib/database-docs.ts";
import { SemanticChunker } from "../src/lib/chunker.ts";
import { loadConfig } from "../src/config.ts";

const DOCS_ROOT = "./reference/applesauce/apps/docs";

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

function extractCategory(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length === 1 || parts[0] === "index.md") {
    return "root";
  }
  return parts[0] ?? "other";
}

function extractHeaders(text: string): string[] {
  const headerRegex = /^#+\s+(.+)$/gm;
  const headers: string[] = [];
  let match;
  while ((match = headerRegex.exec(text)) !== null) {
    headers.push(match[1]!.trim());
  }
  return headers;
}

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

async function findCodeFiles(baseDir: string): Promise<string[]> {
  const files: string[] = [];
  for await (
    const entry of walk(baseDir, {
      exts: ["ts", "tsx", "js", "jsx"],
      skip: [/node_modules/, /\.git/, /dist/, /build/],
    })
  ) {
    if (entry.isFile) files.push(entry.path);
  }
  return files;
}

async function ingestExamples(config: { examplesFolder: string }): Promise<{
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
    const absolutePath = files[i]!;
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
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return { succeeded, failed, total: files.length };
}

async function ingestDocFile(
  absolutePath: string,
  chunker: SemanticChunker,
): Promise<number> {
  const content = await Deno.readTextFile(absolutePath);
  const fileName = basename(absolutePath);
  const relPath = relative(DOCS_ROOT, absolutePath);
  let textContent = content;
  const frontMatterRegex = /^---\n[\s\S]*?\n---\n/;
  if (frontMatterRegex.test(content)) {
    textContent = content.replace(frontMatterRegex, "");
  }
  const stats = await Deno.stat(absolutePath);
  const category = extractCategory(relPath);
  const headers = extractHeaders(textContent);
  const embedder = {
    embed: generateEmbedding,
    embedBatch: generateEmbeddingsBatch,
  };
  const chunks = await chunker.chunkText(textContent, embedder);
  if (chunks.length === 0) return 0;

  const chunkTexts = chunks.map((c) => c.text);
  const embeddings = await generateEmbeddingsBatch(chunkTexts);
  const docChunks: DocChunk[] = chunks.map((chunk, idx) => ({
    id: randomUUID(),
    filePath: relPath,
    fileName,
    chunkIndex: chunk.index,
    text: chunk.text,
    vector: embeddings[idx]!,
    timestamp: new Date().toISOString(),
    metadata: { fileSize: stats.size, category, headers },
  }));

  await deleteDocChunks(relPath);
  await insertDocChunks(docChunks);
  return chunks.length;
}

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

  let filesToProcess = mdFiles;
  if (options.category) {
    filesToProcess = mdFiles.filter((filePath) => {
      const rel = relative(DOCS_ROOT, filePath);
      return extractCategory(rel) === options.category;
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
      const rel = relative(DOCS_ROOT, filePath);
      const n = await ingestDocFile(filePath, chunker);
      totalChunks += n;
      const cat = extractCategory(rel);
      categories.set(cat, (categories.get(cat) ?? 0) + 1);
      console.log(`  ✓ ${rel} (${n} chunks)`);
    } catch (error) {
      console.error(`  ✗ Failed to process ${relative(DOCS_ROOT, filePath)}:`, error);
    }
  }
  return { filesProcessed: filesToProcess.length, totalChunks, categories };
}

async function run(options: {
  examples: boolean;
  docs: boolean;
  category?: string;
}): Promise<void> {
  console.log("\n🚀 Starting ingestion process...");
  const shouldExamples = options.examples ?? true;
  const shouldDocs = options.docs ?? true;

  console.log("\nChecking Ollama availability...");
  if (!(await checkOllamaAvailable())) {
    console.error("❌ Ollama is not running or nomic-embed-text model is not available.");
    console.error("\nPlease ensure Ollama is running and install the model with:");
    console.error("  ollama pull nomic-embed-text:v1.5\n");
    Deno.exit(1);
  }
  console.log("✓ Ollama is ready");

  const config = await loadConfig();
  let examplesStats = { succeeded: 0, failed: 0, total: 0 };
  let docsStats = {
    filesProcessed: 0,
    totalChunks: 0,
    categories: new Map<string, number>(),
  };

  if (shouldExamples) examplesStats = await ingestExamples(config);
  if (shouldDocs) docsStats = await ingestDocs({ category: options.category });

  console.log("\n" + "=".repeat(60));
  console.log("📊 INGESTION SUMMARY");
  console.log("=".repeat(60));
  if (shouldExamples) {
    console.log("\nExamples:");
    console.log(`  Succeeded:  ${examplesStats.succeeded}`);
    console.log(`  Failed:     ${examplesStats.failed}`);
    console.log(`  Total:      ${examplesStats.total}`);
    console.log(`  DB Count:   ${await getExampleCount()}`);
  }
  if (shouldDocs) {
    const stats = await getDocsStats();
    console.log("\nDocumentation:");
    console.log(`  Files:      ${docsStats.filesProcessed}`);
    console.log(`  Chunks:     ${docsStats.totalChunks}`);
    console.log(`  DB Docs:    ${stats.docCount}`);
    console.log(`  DB Chunks:  ${stats.chunkCount}`);
    if (docsStats.categories.size > 0) {
      console.log("\n  Categories:");
      for (const [cat, count] of Array.from(docsStats.categories.entries()).sort()) {
        console.log(`    ${cat.padEnd(20)} ${count} files`);
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

async function main(): Promise<void> {
  const args = Deno.args;
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Ingest – Index example files and/or documentation

USAGE:
  deno task ingest [OPTIONS]

OPTIONS:
  --examples-only    Only ingest example files
  --docs-only        Only ingest documentation
  --category=NAME    Filter docs by category (e.g., core, loading)
  --help, -h         Show this help

EXAMPLES:
  deno task ingest
  deno task ingest -- --examples-only
  deno task ingest -- --docs-only
  deno task ingest -- --docs-only --category=core

REQUIREMENTS:
  Ollama running; nomic-embed-text model; config.json with examplesFolder
`);
    Deno.exit(0);
  }

  const examplesOnly = args.includes("--examples-only");
  const docsOnly = args.includes("--docs-only");
  const category = args.find((a) => a.startsWith("--category="))?.split("=")[1];

  try {
    await run({
      examples: examplesOnly ? true : !docsOnly,
      docs: docsOnly ? true : !examplesOnly,
      category,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Error: ${message}\n`);
    if (error instanceof Error && error.stack) console.error(error.stack);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
