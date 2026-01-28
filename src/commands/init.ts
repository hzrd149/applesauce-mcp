import { DirectoryLoader } from "@langchain/classic/document_loaders/fs/directory";
import { LanceDB } from "@langchain/community/vectorstores/lancedb";
import { OllamaEmbeddings } from "@langchain/ollama";
import {
  MarkdownTextSplitter,
  RecursiveCharacterTextSplitter,
} from "@langchain/textsplitters";
import { RelativeTextLoader } from "../loaders/text.ts";
import ollama from "ollama";
import { Command } from "@cliffy/command";

const DOCS_ROOT = "./reference/applesauce/apps/docs";
const EXAMPLES_ROOT = "./reference/applesauce/apps/examples/src/examples";

async function ingestDocs(): Promise<void> {
  const TABLE_NAME = "docs";
  const EMBEDDING_MODEL = "qwen3-embedding:8b";
  const CHUNK_SIZE = 1000;
  const CHUNK_OVERLAP = 200;

  const models = await ollama.list();
  if (!models.models.some((m) => m.name === EMBEDDING_MODEL)) {
    console.log("Downloading embedding model...");
    await ollama.pull({ model: EMBEDDING_MODEL });
    console.log("Embedding model downloaded");
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
    chunkSize: CHUNK_SIZE, // ~200-300 words
    chunkOverlap: CHUNK_OVERLAP, // Maintain context across chunks
  });

  const splits = await splitter.splitDocuments(docs);
  console.log(`Split into ${splits.length} chunks`);

  // Hugging Face embeddings - free tier Inference API (get HF token at huggingface.co/settings/tokens)
  // const embeddings = new HuggingFaceTransformersEmbeddings({
  //   model: "sentence-transformers/all-MiniLM-L6-v2", // 384-dim, fast/general
  // });

  const embeddings = new OllamaEmbeddings({
    model: EMBEDDING_MODEL,
  });

  // Connect to LanceDB (in-memory for demo; use uri: "./lancedb" for persistent)
  await LanceDB.fromDocuments(splits, embeddings, {
    tableName: TABLE_NAME,
    uri: "./data",
    mode: "overwrite",
    // Optional: index: { indexType: "IVF_PQ", numPartitions: 256 } for large scale
  });
}

async function ingestExamples(): Promise<void> {
  const TABLE_NAME = "examples";
  const EMBEDDING_MODEL = "qwen3-embedding:8b";
  const CHUNK_SIZE = 6000;
  const CHUNK_OVERLAP = 1000;

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
      chunkSize: CHUNK_SIZE, // ~200-300 words
      chunkOverlap: CHUNK_OVERLAP, // Maintain context across chunks
    },
  );

  const splits = await splitter.splitDocuments(docs);
  console.log(`Split into ${splits.length} chunks`);

  // NOTE: Disabled because it crashes the process
  // Hugging Face embeddings - free tier Inference API (get HF token at huggingface.co/settings/tokens)
  // const embeddings = new HuggingFaceTransformersEmbeddings({
  //   model: "sentence-transformers/all-MiniLM-L6-v2", // 384-dim, fast/general
  // });

  const embeddings = new OllamaEmbeddings({
    model: EMBEDDING_MODEL,
  });

  // Connect to LanceDB (in-memory for demo; use uri: "./lancedb" for persistent)
  await LanceDB.fromDocuments(splits, embeddings, {
    tableName: TABLE_NAME,
    uri: "./data",
    mode: "overwrite",
  });
}

async function ingestAll(): Promise<void> {
  await ingestDocs();
  await ingestExamples();
}

export default new Command().description("Initialize the database").action(
  ingestAll,
).command(
  "docs",
  "Ingest docs",
).action(ingestDocs).command("examples", "Ingest examples").action(
  ingestExamples,
);
