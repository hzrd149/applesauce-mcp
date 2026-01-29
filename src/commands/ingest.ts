import { Command } from "@cliffy/command";
import { DirectoryLoader } from "@langchain/classic/document_loaders/fs/directory";
import { Document } from "@langchain/core/documents";
import { LanceDB } from "@langchain/community/vectorstores/lancedb";
import {
  MarkdownTextSplitter,
  RecursiveCharacterTextSplitter,
} from "@langchain/textsplitters";
import { join } from "@std/path";
import ollama from "ollama";
import {
  APPLESAUCE_LOCAL_PATH,
  DB_PATH,
  DOCS_CHUNK_OVERLAP,
  DOCS_CHUNK_SIZE,
  DOCS_ROOT,
  DOCS_TABLE_NAME,
  EMBEDDING_MODEL,
  EXAMPLES_CHUNK_OVERLAP,
  EXAMPLES_CHUNK_SIZE,
  EXAMPLES_ROOT,
  EXAMPLES_TABLE_NAME,
  METHODS_TABLE_NAME,
} from "../const.ts";
import { isApplesauceRepoValid } from "../lib/git.ts";
import { getEmbeddings } from "../lib/lancedb.ts";
import {
  getAllTypeScriptFiles,
  mapSourceToExportPath,
  parsePackageJson,
  parseTypeScriptFile,
} from "../lib/ts-parser.ts";
import { RelativeTextLoader } from "../loaders/text.ts";

export async function ingestDocs(): Promise<void> {
  // Verify repository exists
  if (!await isApplesauceRepoValid()) {
    console.error(
      "Applesauce repository not found. Please run 'applesauce-mcp setup' first.",
    );
    Deno.exit(1);
  }

  console.log("Reading docs...");
  // Load all .md files from folder recursively
  const loader = new DirectoryLoader(DOCS_ROOT, {
    ".md": (filePath: string) => new RelativeTextLoader(filePath, DOCS_ROOT),
  }, true);

  const docs = await loader.load();
  console.log(`Loaded ${docs.length} markdown files`);

  // Split into chunks for better retrieval
  const splitter = new MarkdownTextSplitter({
    chunkSize: DOCS_CHUNK_SIZE, // ~200-300 words
    chunkOverlap: DOCS_CHUNK_OVERLAP, // Maintain context across chunks
  });

  const splits = await splitter.splitDocuments(docs);
  console.log(`Split into ${splits.length} chunks`);

  // Add the documents to the table
  console.log("Adding doc chunks to table...");
  const embeddings = await getEmbeddings();
  await LanceDB.fromDocuments(splits, embeddings, {
    tableName: DOCS_TABLE_NAME,
    uri: DB_PATH,
  });
}

export async function ingestExamples(): Promise<void> {
  // Verify repository exists
  if (!await isApplesauceRepoValid()) {
    console.error(
      "Applesauce repository not found. Please run 'applesauce-mcp setup' first.",
    );
    Deno.exit(1);
  }

  // Download the embedding model if it's not already downloaded
  const models = await ollama.list();
  if (!models.models.some((m) => m.name === EMBEDDING_MODEL)) {
    console.log("Downloading embedding model...");
    await ollama.pull({ model: EMBEDDING_MODEL });
    console.log("Embedding model downloaded");
  }

  console.log("Ingesting examples...");
  // Load all .ts/.tsx files from folder recursively
  const loader = new DirectoryLoader(EXAMPLES_ROOT, {
    ".tsx": (filePath: string) =>
      new RelativeTextLoader(filePath, EXAMPLES_ROOT),
    ".ts": (filePath: string) =>
      new RelativeTextLoader(filePath, EXAMPLES_ROOT),
  }, true);

  const docs = await loader.load();
  console.log(`Loaded ${docs.length} example files`);

  // Split into chunks for better retrieval
  const splitter = RecursiveCharacterTextSplitter.fromLanguage(
    "js",
    {
      chunkSize: EXAMPLES_CHUNK_SIZE, // ~200-300 words
      chunkOverlap: EXAMPLES_CHUNK_OVERLAP, // Maintain context across chunks
    },
  );

  const splits = await splitter.splitDocuments(docs);
  console.log(`Split into ${splits.length} chunks`);

  // Add the documents to the table
  console.log("Adding example chunks to table...");
  const embeddings = await getEmbeddings();
  await LanceDB.fromDocuments(splits, embeddings, {
    tableName: EXAMPLES_TABLE_NAME,
    uri: DB_PATH,
  });
}

export async function ingestMethods(): Promise<void> {
  // Verify repository exists
  if (!await isApplesauceRepoValid()) {
    console.error(
      "Applesauce repository not found. Please run 'applesauce-mcp setup' first.",
    );
    Deno.exit(1);
  }

  // Download the embedding model if it's not already downloaded
  const models = await ollama.list();
  if (!models.models.some((m) => m.name === EMBEDDING_MODEL)) {
    console.log("Downloading embedding model...");
    await ollama.pull({ model: EMBEDDING_MODEL });
    console.log("Embedding model downloaded");
  }

  console.log("Discovering applesauce packages...");
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

  console.log(`Found ${packages.length} packages\n`);

  const allDocuments: Document[] = [];

  for (const packageRoot of packages) {
    console.log(`Processing: ${packageRoot.split("/").pop()}`);

    // Parse package.json
    const packageInfo = await parsePackageJson(packageRoot);

    // Get all TypeScript files
    const srcDir = join(packageRoot, "src");
    let tsFiles: string[];

    try {
      tsFiles = await getAllTypeScriptFiles(srcDir);
    } catch (error) {
      console.error(`  ⚠ Failed to read source files: ${error}`);
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
          ];

          // Add class info for methods
          if (method.className) {
            contentLines.push(
              `Class: ${method.className}`,
            );
          } else {
            contentLines.push(`Import: ${importPath}`);
          }

          if (method.jsDoc) contentLines.push(method.jsDoc);

          const content = contentLines.join("\n");

          // Create LangChain document with metadata
          const doc = new Document({
            pageContent: content,
            metadata: {
              methodName: method.methodName,
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
        console.error(`  ⚠ Failed to parse ${filePath}: ${error}`);
      }
    }

    console.log(`  Extracted ${methodCount} methods`);
  }

  console.log(`\nTotal methods extracted: ${allDocuments.length}`);
  console.log("Adding methods to database...");

  // Add the documents to the table using LangChain
  const embeddings = await getEmbeddings();
  await LanceDB.fromDocuments(allDocuments, embeddings, {
    tableName: METHODS_TABLE_NAME,
    uri: DB_PATH,
  });

  console.log(`✓ Successfully ingested ${allDocuments.length} methods`);
}

async function ingestAll(): Promise<void> {
  await ingestDocs();
  await ingestExamples();
  await ingestMethods();
}

export default new Command().description(
  "Ingest the documentation, examples, and methods into the local database",
).action(
  ingestAll,
).command(
  "docs",
  "Ingest documentation into the local database",
).action(ingestDocs).command(
  "examples",
  "Ingest examples into the local database",
).action(ingestExamples).command(
  "methods",
  "Ingest exported methods from applesauce packages",
).action(
  ingestMethods,
);
