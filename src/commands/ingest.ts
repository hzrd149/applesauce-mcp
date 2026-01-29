import { Command } from "@cliffy/command";
import { DirectoryLoader } from "@langchain/classic/document_loaders/fs/directory";
import { LanceDB } from "@langchain/community/vectorstores/lancedb";
import {
  MarkdownTextSplitter,
  RecursiveCharacterTextSplitter,
} from "@langchain/textsplitters";
import ollama from "ollama";
import {
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
} from "../const.ts";
import { isApplesauceRepoValid } from "../lib/git.ts";
import { getEmbeddings } from "../lib/lancedb.ts";
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

async function ingestAll(): Promise<void> {
  await ingestDocs();
  await ingestExamples();
}

export default new Command().description(
  "Ingest the documentation and examples into the local database",
).action(
  ingestAll,
).command(
  "docs",
  "Ingest documentation into the local database",
).action(ingestDocs).command(
  "examples",
  "Ingest examples into the local database",
).action(
  ingestExamples,
);
