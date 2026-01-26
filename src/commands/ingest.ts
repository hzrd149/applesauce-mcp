/**
 * Ingest command - Process and index example files from examples directory
 */

import { walk } from "@std/fs";
import { relative, resolve } from "@std/path";
import { crypto } from "@std/crypto";
import { type ExampleRecord } from "../types.ts";
import { extractMetadata } from "../lib/metadata.ts";
import {
  checkOllamaAvailable,
  createEmbeddingText,
  generateEmbedding,
} from "../lib/embeddings.ts";
import {
  getExampleCount,
  initDatabase,
  upsertExample,
} from "../lib/database.ts";
import { loadConfig } from "../config.ts";

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
 * Process a single file and create an example record
 */
async function processFile(
  absolutePath: string,
  relativePath: string,
): Promise<ExampleRecord> {
  console.log(`  Processing: ${relativePath}`);

  // Read file content
  const code = await Deno.readTextFile(absolutePath);

  // Extract metadata
  const metadata = extractMetadata(relativePath, code);

  // Generate embedding
  const embeddingText = createEmbeddingText(
    metadata.name,
    metadata.description,
    metadata.category,
    code,
  );
  const vector = await generateEmbedding(embeddingText);

  // Create record
  const record: ExampleRecord = {
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

  return record;
}

/**
 * Find all TypeScript/JavaScript files in the examples directory
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
 * Main ingest command
 */
export async function ingestCommand(): Promise<void> {
  console.log("🚀 Starting example file ingestion...\n");

  // Load config
  console.log("Loading configuration...");
  const config = await loadConfig();
  console.log(`✓ Config loaded: examples folder = ${config.examplesFolder}\n`);

  // Check Ollama availability
  console.log("Checking Ollama availability...");
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
  console.log("✓ Ollama is ready\n");

  // Initialize database
  console.log("Initializing database...");
  await initDatabase();
  console.log("✓ Database ready\n");

  // Find examples directory
  const examplesPath = resolve(Deno.cwd(), config.examplesFolder);

  console.log(`Scanning examples directory: ${examplesPath}`);
  const files = await findCodeFiles(examplesPath);
  console.log(`✓ Found ${files.length} code files\n`);

  if (files.length === 0) {
    console.error("❌ No code files found in examples directory");
    Deno.exit(1);
  }

  // Process files
  let succeeded = 0;
  let failed = 0;

  console.log("Processing files...\n");

  for (let i = 0; i < files.length; i++) {
    const absolutePath = files[i];
    const relativePath = relative(examplesPath, absolutePath);

    try {
      console.log(`[${i + 1}/${files.length}]`);
      const record = await processFile(absolutePath, relativePath);
      await upsertExample(record);
      console.log(`  ✓ Indexed: ${record.name}`);
      succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Failed: ${message}`);
      failed++;
    }

    // Small delay to avoid overwhelming Ollama
    if (i < files.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Summary
  const totalCount = await getExampleCount();
  console.log("\n" + "=".repeat(50));
  console.log("📊 Ingestion Summary");
  console.log("=".repeat(50));
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Total:     ${files.length}`);
  console.log(`  DB Count:  ${totalCount}`);
  console.log("=".repeat(50) + "\n");

  if (failed > 0) {
    console.log("⚠️  Some files failed to process. See errors above.");
  } else {
    console.log("✅ All files processed successfully!");
  }
}
