/**
 * LanceDB service: connection, tables, vector store, embedding API, and docs API
 * (hybrid search). Single entry point for database and embedding operations.
 * Examples are read from the filesystem via lib/examples.ts, not stored here.
 */

import lancedb from "@lancedb/lancedb";
import type * as lancedbTypes from "@lancedb/lancedb";
import { Index } from "@lancedb/lancedb";
import { LanceDB } from "@langchain/community/vectorstores/lancedb";
import type { Embeddings } from "@langchain/core/embeddings";
import { OllamaEmbeddings } from "@langchain/ollama";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Ollama } from "ollama";
import {
  DB_PATH,
  DOCS_TABLE_NAME,
  EMBEDDING_MODEL,
  EMBEDDING_PROVIDER,
  EXAMPLES_TABLE_NAME,
  METHODS_TABLE_NAME,
  OLLAMA_HOST,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from "../const.ts";
import type { DocChunk, DocSearchResult } from "../types.ts";
import * as logger from "./logger.ts";

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

let database: lancedb.Connection | null = null;

/** Get the singleton LanceDB connection */
export async function getDatabase(): Promise<lancedb.Connection> {
  if (database) {
    return database;
  }
  database = await lancedb.connect(DB_PATH);
  return database;
}

/** Get a table by name from the shared connection */
export async function getTable(name: string): Promise<lancedb.Table> {
  const db = await getDatabase();
  return db.openTable(name);
}

let embeddingsInstance: Embeddings | null = null;

/**
 * Get the embeddings instance based on the configured provider.
 * Supports Ollama and OpenAI-compatible providers.
 * For Ollama, ensures the model is downloaded before use.
 *
 * @returns Embeddings instance (OllamaEmbeddings or OpenAIEmbeddings)
 * @throws Error if provider is invalid or configuration is missing
 */
export async function getEmbeddings(): Promise<Embeddings> {
  if (embeddingsInstance) {
    return embeddingsInstance;
  }

  const provider = EMBEDDING_PROVIDER.toLowerCase();

  if (provider === "ollama") {
    // Ollama provider: download model if needed
    try {
      const ollamaClient = new Ollama({ host: OLLAMA_HOST });
      const models = await ollamaClient.list();
      if (
        !models.models.some((m: { name: string }) => m.name === EMBEDDING_MODEL)
      ) {
        logger.log(`Downloading embedding model: ${EMBEDDING_MODEL}...`);
        await ollamaClient.pull({ model: EMBEDDING_MODEL });
        logger.log("Embedding model downloaded");
      }
    } catch (error) {
      throw new Error(
        `Failed to connect to Ollama at ${OLLAMA_HOST}: ${error}`,
      );
    }

    embeddingsInstance = new OllamaEmbeddings({
      model: EMBEDDING_MODEL,
      baseUrl: OLLAMA_HOST,
    });
  } else if (provider === "openai") {
    // OpenAI-compatible provider
    if (!OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required when using OpenAI provider",
      );
    }

    if (!EMBEDDING_MODEL) {
      throw new Error(
        "EMBEDDING_MODEL environment variable is required when using OpenAI provider",
      );
    }

    embeddingsInstance = new OpenAIEmbeddings({
      model: EMBEDDING_MODEL,
      apiKey: OPENAI_API_KEY,
      configuration: {
        baseURL: OPENAI_BASE_URL,
      },
    }) as unknown as Embeddings;

    logger.log(
      `Initialized OpenAI embeddings: ${EMBEDDING_MODEL} at ${OPENAI_BASE_URL}`,
    );
  } else {
    throw new Error(
      `Invalid EMBEDDING_PROVIDER: "${EMBEDDING_PROVIDER}". Must be "ollama" or "openai"`,
    );
  }

  if (!embeddingsInstance) {
    throw new Error("Failed to initialize embeddings instance");
  }

  return embeddingsInstance;
}

/** Get a LangChain vector store for a table (embeds queries internally) */
export async function getVectorStore(name: string) {
  const embeddings = await getEmbeddings();
  const table = await getTable(name);

  return new LanceDB(embeddings, {
    table,
  });
}

// ---------------------------------------------------------------------------
// Docs API (hybrid search: vector + FTS)
// ---------------------------------------------------------------------------

const FTS_INDEX_NAME = "fts_docs_v1";

let docsTable: lancedbTypes.Table | null = null;
let ftsEnabled = false;
let hybridWeight = 0.6;
let candidateMultiplier = 2;

export function setHybridSearchConfig(
  weight: number,
  multiplier: number,
): void {
  hybridWeight = weight;
  candidateMultiplier = multiplier;
}

/** Initialize docs table (warmup + FTS). */
export async function initDocsDatabase(): Promise<void> {
  const db = await getDatabase();
  const tableNames = await db.tableNames();

  if (tableNames.includes(DOCS_TABLE_NAME)) {
    docsTable = await getTable(DOCS_TABLE_NAME);
    logger.log(`✓ Opened docs table: ${DOCS_TABLE_NAME}`);
    await ensureDocsFtsIndex();
  } else {
    logger.log(
      `ℹ Table "${DOCS_TABLE_NAME}" will be created on first ingestion`,
    );
  }
}

async function ensureDocsFtsIndex(): Promise<void> {
  if (!docsTable) return;
  try {
    const indices = await docsTable.listIndices();
    const existingFtsIndices = indices.filter((idx) => idx.indexType === "FTS");
    const hasExpectedIndex = existingFtsIndices.some((idx) =>
      idx.name === FTS_INDEX_NAME
    );
    if (hasExpectedIndex) {
      ftsEnabled = true;
      logger.log(`✓ FTS index exists: ${FTS_INDEX_NAME}`);
      return;
    }
    await docsTable.createIndex("text", {
      config: Index.fts({
        baseTokenizer: "simple",
        stem: true,
      }),
      name: FTS_INDEX_NAME,
    });
    ftsEnabled = true;
    logger.log(`✓ Created FTS index: ${FTS_INDEX_NAME}`);
    for (const idx of existingFtsIndices) {
      if (idx.name !== FTS_INDEX_NAME) {
        await docsTable.dropIndex(idx.name);
        logger.log(`✓ Dropped old FTS index: ${idx.name}`);
      }
    }
  } catch (error) {
    logger.error(`⚠ Failed to create FTS index:`, error);
    ftsEnabled = false;
  }
}

async function rebuildDocsFtsIndex(): Promise<void> {
  if (!docsTable || !ftsEnabled) return;
  try {
    const cleanupThreshold = new Date(Date.now() - 60 * 1000);
    await docsTable.optimize({ cleanupOlderThan: cleanupThreshold });
  } catch (error) {
    logger.error(`⚠ Failed to rebuild FTS index:`, error);
  }
}

async function getDocsTable(): Promise<lancedbTypes.Table> {
  if (docsTable) return docsTable;
  const db = await getDatabase();
  const tableNames = await db.tableNames();
  if (!tableNames.includes(DOCS_TABLE_NAME)) {
    throw new Error("Docs table does not exist yet. Ingest documents first.");
  }
  docsTable = await getTable(DOCS_TABLE_NAME);
  return docsTable;
}

export async function deleteDocChunks(filePath: string): Promise<void> {
  let tbl: lancedbTypes.Table;
  try {
    tbl = await getDocsTable();
  } catch {
    logger.log("⚠ Skipping deletion as table does not exist");
    return;
  }
  try {
    const escapedFilePath = filePath.replace(/'/g, "''");
    await tbl.delete(`\`filePath\` = '${escapedFilePath}'`);
    logger.log(`✓ Deleted chunks for: ${filePath}`);
    await rebuildDocsFtsIndex();
  } catch (error) {
    const errorMessage = (error as Error).message.toLowerCase();
    if (
      !errorMessage.includes("not found") &&
      !errorMessage.includes("does not exist") &&
      !errorMessage.includes("no matching")
    ) {
      throw new Error(`Failed to delete chunks for ${filePath}: ${error}`);
    }
  }
}

export async function insertDocChunks(chunks: DocChunk[]): Promise<void> {
  if (chunks.length === 0) return;
  const records = chunks.map((c) => c as unknown as Record<string, unknown>);
  const db = await getDatabase();
  const tableNames = await db.tableNames();
  try {
    if (!tableNames.includes(DOCS_TABLE_NAME)) {
      docsTable = await db.createTable(DOCS_TABLE_NAME, records);
      logger.log(`✓ Created docs table: ${DOCS_TABLE_NAME}`);
      await ensureDocsFtsIndex();
    } else {
      const tbl = await getDocsTable();
      await tbl.add(records);
      await rebuildDocsFtsIndex();
    }
    logger.log(`✓ Inserted ${chunks.length} chunks`);
  } catch (error) {
    throw new Error(`Failed to insert chunks: ${error}`);
  }
}

function applyKeywordBoost(
  vectorResults: DocChunk[],
  ftsResults: Record<string, unknown>[],
  weight: number,
): DocChunk[] {
  let maxBm25Score = 0;
  for (const result of ftsResults) {
    if (!result) continue;
    const score = (result["_score"] as number) ?? 0;
    if (score > maxBm25Score) maxBm25Score = score;
  }
  const ftsScoreMap = new Map<string, number>();
  for (const result of ftsResults) {
    if (!result) continue;
    const key = `${result["filePath"]}:${result["chunkIndex"]}`;
    const rawScore = (result["_score"] as number) ?? 0;
    const normalized = maxBm25Score > 0 ? rawScore / maxBm25Score : 0;
    ftsScoreMap.set(key, normalized);
  }
  const boostedResults = vectorResults.map((result) => {
    const key = `${result.filePath}:${result.chunkIndex}`;
    const keywordScore = ftsScoreMap.get(key) ?? 0;
    const distance = (result as unknown as { _distance: number })._distance ??
      0;
    const boostedDistance = distance / (1 + keywordScore * weight);
    return { ...result, _distance: boostedDistance } as DocChunk & {
      _distance: number;
    };
  });
  return boostedResults.sort((a, b) => {
    const aScore = (a as unknown as { _distance: number })._distance ?? 0;
    const bScore = (b as unknown as { _distance: number })._distance ?? 0;
    return aScore - bScore;
  });
}

export async function searchDocs(
  params: { query: string; limit?: number },
  queryVector: number[],
): Promise<DocSearchResult[]> {
  const tbl = await getDocsTable();
  const limit = params.limit ?? 10;
  if (limit < 1 || limit > 20) {
    throw new Error(`Invalid limit: expected 1-20, got ${limit}`);
  }
  try {
    const candidateLimit = limit * candidateMultiplier;
    const query = tbl.vectorSearch(queryVector).distanceType("dot").limit(
      candidateLimit,
    );
    const vectorResults = await query.toArray();
    let results = vectorResults;

    if (ftsEnabled && params.query.trim().length > 0 && hybridWeight > 0) {
      try {
        const uniqueFilePaths = [...new Set(results.map((r) => r.filePath))];
        const escapedPaths = uniqueFilePaths.map((p) =>
          `'${p.replace(/'/g, "''")}'`
        );
        const whereClause = `\`filePath\` IN (${escapedPaths.join(", ")})`;
        const ftsResults = await tbl
          .search(params.query, "fts", "text")
          .where(whereClause)
          .select(["filePath", "chunkIndex", "text", "metadata", "_score"])
          .limit(results.length * 2)
          .toArray();
        results = applyKeywordBoost(
          results,
          ftsResults as Record<string, unknown>[],
          hybridWeight,
        );
      } catch (ftsError) {
        logger.error("⚠ FTS search failed, using vector-only:", ftsError);
      }
    }
    return results.slice(0, limit);
  } catch (error) {
    throw new Error(`Failed to search docs: ${error}`);
  }
}

export async function listDocs(): Promise<
  Array<{ filePath: string; chunkCount: number; category: string }>
> {
  const tbl = await getDocsTable();
  const allRecords = await tbl.query().toArray();
  const fileMap = new Map<string, { chunkCount: number; category: string }>();
  for (const record of allRecords) {
    const chunk = record as unknown as DocChunk;
    const filePath = chunk.filePath;
    const category = chunk.metadata.category;
    if (fileMap.has(filePath)) {
      const info = fileMap.get(filePath)!;
      info.chunkCount += 1;
    } else {
      fileMap.set(filePath, { chunkCount: 1, category });
    }
  }
  return Array.from(fileMap.entries()).map(([filePath, info]) => ({
    filePath,
    chunkCount: info.chunkCount,
    category: info.category,
  }));
}

export async function getDocsStats(): Promise<{
  docCount: number;
  chunkCount: number;
  categories: Record<string, number>;
}> {
  const tbl = await getDocsTable();
  const allRecords = await tbl.query().toArray();
  const chunkCount = allRecords.length;
  const uniqueFiles = new Set<string>();
  const categories: Record<string, number> = {};
  for (const record of allRecords) {
    const chunk = record as unknown as DocChunk;
    uniqueFiles.add(chunk.filePath);
    const category = chunk.metadata.category;
    categories[category] = (categories[category] ?? 0) + 1;
  }
  return {
    docCount: uniqueFiles.size,
    chunkCount,
    categories,
  };
}

export function closeDocsDatabase() {
  docsTable = null;
  ftsEnabled = false;
}

// ---------------------------------------------------------------------------
// Database validation
// ---------------------------------------------------------------------------

/**
 * Check if all required tables (docs, examples, methods) exist in the database.
 * Returns true only if all three tables are present, indicating data has been ingested.
 *
 * @returns Promise<boolean> - true if all tables exist, false otherwise
 */
export async function areAllTablesIngested(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const tableNames = await db.tableNames();

    const requiredTables = [
      DOCS_TABLE_NAME,
      EXAMPLES_TABLE_NAME,
      METHODS_TABLE_NAME,
    ];
    const allTablesExist = requiredTables.every((table) =>
      tableNames.includes(table)
    );

    return allTablesExist;
  } catch {
    return false;
  }
}
