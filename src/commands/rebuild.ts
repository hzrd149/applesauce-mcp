import { Command } from "@cliffy/command";
import { DirectoryLoader } from "@langchain/classic/document_loaders/fs/directory";
import { LanceDB } from "@langchain/community/vectorstores/lancedb";
import { Document } from "@langchain/core/documents";
import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { join } from "@std/path";
import {
  APPLESAUCE_LOCAL_PATH,
  DB_PATH,
  DOCS_CHUNK_OVERLAP,
  DOCS_CHUNK_SIZE,
  DOCS_ROOT,
  DOCS_TABLE_NAME,
  EXAMPLES_ROOT,
  EXAMPLES_TABLE_NAME,
  METHODS_TABLE_NAME,
} from "../const.ts";
import { isApplesauceRepoValid } from "../lib/git.ts";
import { getDatabase, getEmbeddings } from "../lib/lancedb.ts";
import * as logger from "../lib/logger.ts";
import {
  getAllTypeScriptFiles,
  mapSourceToExportPath,
  parsePackageJson,
  parseTypeScriptFile,
} from "../lib/ts-parser.ts";
import { ExampleLoader } from "../loaders/example.ts";
import { RelativeTextLoader } from "../loaders/text.ts";

/**
 * Delete a database table if it exists
 * @param tableName - Name of the table to delete
 */
async function deleteTableIfExists(tableName: string): Promise<void> {
  try {
    const db = await getDatabase();
    const tableNames = await db.tableNames();

    if (tableNames.includes(tableName)) {
      await db.dropTable(tableName);
      logger.log(`✓ Deleted existing table: ${tableName}`);
    } else {
      logger.log(`ℹ Table "${tableName}" does not exist, skipping deletion`);
    }
  } catch (error) {
    logger.error(`⚠ Failed to delete table ${tableName}:`, error);
    throw error;
  }
}

export async function rebuildDocs(): Promise<void> {
  // Verify repository exists
  if (!await isApplesauceRepoValid()) {
    logger.error(
      "Applesauce repository not found. Please run 'applesauce-mcp setup' first.",
    );
    Deno.exit(1);
  }

  // Delete existing docs table to prevent duplication
  logger.log("Deleting existing docs database...");
  await deleteTableIfExists(DOCS_TABLE_NAME);

  logger.log("Reading docs...");
  // Load all .md files from folder recursively
  const loader = new DirectoryLoader(DOCS_ROOT, {
    ".md": (filePath: string) => new RelativeTextLoader(filePath, DOCS_ROOT),
  }, true);

  const docs = await loader.load();
  logger.log(`Loaded ${docs.length} markdown files`);

  // Split into chunks for better retrieval
  const splitter = new MarkdownTextSplitter({
    chunkSize: DOCS_CHUNK_SIZE, // ~200-300 words
    chunkOverlap: DOCS_CHUNK_OVERLAP, // Maintain context across chunks
  });

  const splits = await splitter.splitDocuments(docs);
  logger.log(`Split into ${splits.length} chunks`);

  // Add the documents to the table
  logger.log("Adding doc chunks to table...");
  const embeddings = await getEmbeddings();
  await LanceDB.fromDocuments(splits, embeddings, {
    tableName: DOCS_TABLE_NAME,
    uri: DB_PATH,
  });
}

export async function rebuildExamples(): Promise<void> {
  // Verify repository exists
  if (!await isApplesauceRepoValid()) {
    logger.error(
      "Applesauce repository not found. Please run 'applesauce-mcp setup' first.",
    );
    Deno.exit(1);
  }

  // Delete existing examples table to prevent duplication
  logger.log("Deleting existing examples database...");
  await deleteTableIfExists(EXAMPLES_TABLE_NAME);

  logger.log("Rebuilding examples...");
  // Load all .ts/.tsx files from folder recursively using ExampleLoader
  // This extracts front matter metadata instead of embedding the full code
  const loader = new DirectoryLoader(EXAMPLES_ROOT, {
    ".tsx": (filePath: string) => new ExampleLoader(filePath, EXAMPLES_ROOT),
    ".ts": (filePath: string) => new ExampleLoader(filePath, EXAMPLES_ROOT),
  }, true);

  const docs = await loader.load();
  logger.log(`Loaded ${docs.length} example files`);

  // NO CHUNKING - Each example is a single document with only front matter embedded
  // The front matter (title, description, tags) is much more relevant for search
  // than the actual code, which would add noise to the embeddings

  // Add the documents to the table (one document per example file)
  logger.log("Adding examples to table...");
  const embeddings = await getEmbeddings();
  await LanceDB.fromDocuments(docs, embeddings, {
    tableName: EXAMPLES_TABLE_NAME,
    uri: DB_PATH,
  });

  logger.log(`✓ Successfully indexed ${docs.length} examples`);
}

export async function rebuildMethods(): Promise<void> {
  // Verify repository exists
  if (!await isApplesauceRepoValid()) {
    logger.error(
      "Applesauce repository not found. Please run 'applesauce-mcp setup' first.",
    );
    Deno.exit(1);
  }

  // Delete existing methods table to prevent duplication
  logger.log("Deleting existing methods database...");
  await deleteTableIfExists(METHODS_TABLE_NAME);

  logger.log("Discovering applesauce packages...");
  const packagesDir = join(APPLESAUCE_LOCAL_PATH, "packages");
  const packages: string[] = [];

  for await (const entry of Deno.readDir(packagesDir)) {
    if (entry.isDirectory) {
      const packagePath = join(packagesDir, entry.name);
      const packageJsonPath = join(packagePath, "package.json");
      try {
        await Deno.stat(packageJsonPath);
        packages.push(packagePath);
      } catch {
        // Skip directories without package.json
      }
    }
  }

  logger.log(`Found ${packages.length} packages\n`);

  const allDocuments: Document[] = [];

  for (const packageRoot of packages) {
    logger.log(`Processing: ${packageRoot.split("/").pop()}`);

    // Parse package.json
    const packageInfo = await parsePackageJson(packageRoot);

    // Get all TypeScript files
    const srcDir = join(packageRoot, "src");
    let tsFiles: string[];

    try {
      tsFiles = await getAllTypeScriptFiles(srcDir);
    } catch (error) {
      logger.error(`  ⚠ Failed to read source files: ${error}`);
      continue;
    }

    // Parse all files and create documents
    let methodCount = 0;
    for (const filePath of tsFiles) {
      try {
        const methods = parseTypeScriptFile(filePath, packageRoot);

        for (const method of methods) {
          // Map export path
          const exportPath = mapSourceToExportPath(
            filePath,
            packageInfo.exports,
            packageRoot,
          );
          const importPath = exportPath
            ? `${packageInfo.name}/${exportPath}`
            : packageInfo.name;

          // Create document content with structured format
          const contentLines = [
            `${method.kind.toUpperCase()}: ${method.methodName}`,
            `Signature: ${method.signature}`,
          ];

          // Add class info for methods
          if (method.className) {
            contentLines.push(
              `Class: ${method.className}`,
            );
          } else {
            contentLines.push(`Import: ${importPath}`);
          }

          if (method.jsDoc) contentLines.push(`\n${method.jsDoc}`);

          const content = contentLines.join("\n");

          // Create LangChain document with metadata
          const doc = new Document({
            pageContent: content,
            metadata: {
              methodName: method.methodName,
              signature: method.signature,
              kind: method.kind,
              packageName: packageInfo.name,
              packageVersion: packageInfo.version,
              importPath,
              exportPath: exportPath || "",
              sourceFile: method.sourceFile,
              lineNumber: method.lineNumber,
              hasJsDoc: !!method.jsDoc,
              className: method.className || "",
            },
          });

          allDocuments.push(doc);
          methodCount++;
        }
      } catch (error) {
        logger.error(`  ⚠ Failed to parse ${filePath}: ${error}`);
      }
    }

    logger.log(`  Extracted ${methodCount} methods`);
  }

  logger.log(`\nTotal methods extracted: ${allDocuments.length}`);
  logger.log("Adding methods to database...");

  // Add the documents to the table using LangChain
  const embeddings = await getEmbeddings();
  await LanceDB.fromDocuments(allDocuments, embeddings, {
    tableName: METHODS_TABLE_NAME,
    uri: DB_PATH,
  });

  logger.log(`✓ Successfully rebuilt ${allDocuments.length} methods`);
}

async function rebuildAll(): Promise<void> {
  logger.log(`📁 Data storage locations:`);
  logger.log(`   Repository: ${APPLESAUCE_LOCAL_PATH}`);
  logger.log(`   Database: ${DB_PATH}\n`);
  
  await rebuildDocs();
  await rebuildExamples();
  await rebuildMethods();
}

export default new Command().description(
  "Rebuild the documentation, examples, and methods databases from scratch (deletes existing data)",
).action(
  rebuildAll,
).command(
  "docs",
  "Rebuild documentation database from scratch",
).action(rebuildDocs).command(
  "examples",
  "Rebuild examples database from scratch",
).action(rebuildExamples).command(
  "methods",
  "Rebuild exported methods database from scratch",
).action(
  rebuildMethods,
);
