/**
 * LanceDB operations for documentation chunks with hybrid search
 */

import * as lancedb from "@lancedb/lancedb";
import { Index } from "@lancedb/lancedb";
import type { DocChunk, DocSearchParams, DocSearchResult } from "../types.ts";

const DB_PATH = "./data/lancedb";
const TABLE_NAME = "docs";
const FTS_INDEX_NAME = "fts_docs_v1";
const GROUPING_BOUNDARY_STD_MULTIPLIER = 1.5;

let db: lancedb.Connection | null = null;
let table: lancedb.Table | null = null;
let ftsEnabled = false;

/**
 * Hybrid search configuration
 */
let hybridWeight = 0.6; // Default keyword boost weight
let candidateMultiplier = 2; // Default candidate multiplier

/**
 * Set hybrid search configuration
 */
export function setHybridSearchConfig(
  weight: number,
  multiplier: number,
): void {
  hybridWeight = weight;
  candidateMultiplier = multiplier;
}

/**
 * Initialize the docs database and table
 */
export async function initDocsDatabase(): Promise<void> {
  db = await lancedb.connect(DB_PATH);

  const tableNames = await db.tableNames();

  if (tableNames.includes(TABLE_NAME)) {
    table = await db.openTable(TABLE_NAME);
    console.error(`✓ Opened docs table: ${TABLE_NAME}`);

    // Ensure FTS index exists
    await ensureFtsIndex();
  } else {
    console.error(`ℹ Table "${TABLE_NAME}" will be created on first ingestion`);
  }
}

/**
 * Ensure FTS index exists for hybrid search
 */
async function ensureFtsIndex(): Promise<void> {
  if (!table) return;

  try {
    const indices = await table.listIndices();
    const existingFtsIndices = indices.filter((idx) => idx.indexType === "FTS");
    const hasExpectedIndex = existingFtsIndices.some((idx) =>
      idx.name === FTS_INDEX_NAME
    );

    if (hasExpectedIndex) {
      ftsEnabled = true;
      console.error(`✓ FTS index exists: ${FTS_INDEX_NAME}`);
      return;
    }

    // Create new FTS index
    await table.createIndex("text", {
      config: Index.fts({
        baseTokenizer: "simple",
        stem: true, // Handle plurals, tenses
      }),
      name: FTS_INDEX_NAME,
    });
    ftsEnabled = true;
    console.error(`✓ Created FTS index: ${FTS_INDEX_NAME}`);

    // Drop old FTS indices
    for (const idx of existingFtsIndices) {
      if (idx.name !== FTS_INDEX_NAME) {
        await table.dropIndex(idx.name);
        console.error(`✓ Dropped old FTS index: ${idx.name}`);
      }
    }
  } catch (error) {
    console.error(`⚠ Failed to create FTS index:`, error);
    ftsEnabled = false;
  }
}

/**
 * Rebuild FTS index after data changes
 */
async function rebuildFtsIndex(): Promise<void> {
  if (!table || !ftsEnabled) return;

  try {
    const cleanupThreshold = new Date(Date.now() - 60 * 1000); // 1 minute
    await table.optimize({ cleanupOlderThan: cleanupThreshold });
  } catch (error) {
    console.error(`⚠ Failed to rebuild FTS index:`, error);
  }
}

/**
 * Get or create the docs table
 */
async function getTable(): Promise<lancedb.Table> {
  if (!db) {
    throw new Error("Database not initialized. Call initDocsDatabase() first.");
  }

  if (table) {
    return table;
  }

  throw new Error("Docs table does not exist yet. Ingest documents first.");
}

/**
 * Delete all chunks for a specific file
 *
 * @param filePath - File path (relative to docs root)
 */
export async function deleteDocChunks(filePath: string): Promise<void> {
  if (!table) {
    console.error("⚠ Skipping deletion as table does not exist");
    return;
  }

  try {
    const escapedFilePath = filePath.replace(/'/g, "''");
    await table.delete(`\`filePath\` = '${escapedFilePath}'`);
    console.error(`✓ Deleted chunks for: ${filePath}`);

    await rebuildFtsIndex();
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

/**
 * Insert document chunks into the database
 *
 * @param chunks - Array of document chunks
 */
export async function insertDocChunks(chunks: DocChunk[]): Promise<void> {
  if (chunks.length === 0) {
    return;
  }

  try {
    if (!table) {
      // Create table on first insertion
      if (!db) {
        throw new Error("Database not initialized");
      }

      const records = chunks.map((chunk) =>
        chunk as unknown as Record<string, unknown>
      );
      table = await db.createTable(TABLE_NAME, records);
      console.error(`✓ Created docs table: ${TABLE_NAME}`);

      // Create FTS index
      await ensureFtsIndex();
    } else {
      // Add to existing table
      const records = chunks.map((chunk) =>
        chunk as unknown as Record<string, unknown>
      );
      await table.add(records);

      // Rebuild FTS index
      await rebuildFtsIndex();
    }

    console.error(`✓ Inserted ${chunks.length} chunks`);
  } catch (error) {
    throw new Error(`Failed to insert chunks: ${error}`);
  }
}

/**
 * Apply grouping algorithm to filter results by relevance gaps
 */
function applyGrouping(
  results: DocChunk[],
  mode: "similar" | "related",
): DocChunk[] {
  if (results.length <= 1) return results;

  // Calculate gaps between consecutive results
  const gaps: { index: number; gap: number }[] = [];
  for (let i = 0; i < results.length - 1; i++) {
    const current = results[i];
    const next = results[i + 1];
    if (current !== undefined && next !== undefined) {
      // Use _distance from search results (stored temporarily)
      const currScore =
        (current as unknown as { _distance: number })._distance ?? 0;
      const nextScore = (next as unknown as { _distance: number })._distance ??
        0;
      gaps.push({ index: i + 1, gap: nextScore - currScore });
    }
  }

  if (gaps.length === 0) return results;

  // Calculate statistical threshold
  const gapValues = gaps.map((g) => g.gap);
  const mean = gapValues.reduce((a, b) => a + b, 0) / gapValues.length;
  const variance = gapValues.reduce((a, b) => a + (b - mean) ** 2, 0) /
    gapValues.length;
  const std = Math.sqrt(variance);
  const threshold = mean + GROUPING_BOUNDARY_STD_MULTIPLIER * std;

  // Find boundaries
  const boundaries = gaps.filter((g) => g.gap > threshold).map((g) => g.index);

  if (boundaries.length === 0) return results;

  // Determine cutoff based on mode
  const groupsToInclude = mode === "similar" ? 1 : 2;
  const boundaryIndex = groupsToInclude - 1;

  if (boundaryIndex >= boundaries.length) {
    return mode === "related" ? results : results.slice(0, boundaries[0]);
  }

  return results.slice(0, boundaries[boundaryIndex]);
}

/**
 * Apply keyword boost to rerank vector search results
 */
function applyKeywordBoost(
  vectorResults: DocChunk[],
  ftsResults: Record<string, unknown>[],
  weight: number,
): DocChunk[] {
  // Build FTS score map with normalized scores
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

  // Apply multiplicative boost
  const boostedResults = vectorResults.map((result) => {
    const key = `${result.filePath}:${result.chunkIndex}`;
    const keywordScore = ftsScoreMap.get(key) ?? 0;
    const distance = (result as unknown as { _distance: number })._distance ??
      0;

    // Multiplicative boost: distance / (1 + keyword * weight)
    const boostedDistance = distance / (1 + keywordScore * weight);

    return {
      ...result,
      _distance: boostedDistance,
    } as DocChunk & { _distance: number };
  });

  // Re-sort by boosted distance
  return boostedResults.sort((a, b) => {
    const aScore = (a as unknown as { _distance: number })._distance ?? 0;
    const bScore = (b as unknown as { _distance: number })._distance ?? 0;
    return aScore - bScore;
  });
}

/**
 * Search documentation with hybrid search (semantic + keyword)
 *
 * @param params - Search parameters
 * @param queryVector - Query embedding vector
 * @returns Array of matching document chunks with scores
 */
export async function searchDocs(
  params: DocSearchParams,
  queryVector: number[],
): Promise<DocSearchResult[]> {
  const tbl = await getTable();
  const limit = params.limit ?? 10;

  if (limit < 1 || limit > 20) {
    throw new Error(`Invalid limit: expected 1-20, got ${limit}`);
  }

  try {
    // Step 1: Semantic (vector) search
    const candidateLimit = limit * candidateMultiplier;
    const query = tbl.vectorSearch(queryVector).distanceType("dot").limit(
      candidateLimit,
    );

    const vectorResults = await query.toArray();
    let results = vectorResults as unknown as DocChunk[];

    // Step 2: Apply keyword boost if enabled
    if (
      ftsEnabled && params.query.trim().length > 0 && hybridWeight > 0
    ) {
      try {
        // Get unique filePaths from vector results
        const uniqueFilePaths = [...new Set(results.map((r) => r.filePath))];

        // Build WHERE clause
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
        console.error("⚠ FTS search failed, using vector-only:", ftsError);
      }
    }

    // Return top results
    return results.slice(0, limit);
  } catch (error) {
    throw new Error(`Failed to search docs: ${error}`);
  }
}

/**
 * List all ingested documentation files
 */
export async function listDocs(): Promise<
  Array<{ filePath: string; chunkCount: number; category: string }>
> {
  const tbl = await getTable();

  try {
    const allRecords = await tbl.query().toArray();

    const fileMap = new Map<
      string,
      { chunkCount: number; category: string }
    >();

    for (const record of allRecords) {
      const chunk = record as unknown as DocChunk;
      const filePath = chunk.filePath;
      const category = chunk.metadata.category;

      if (fileMap.has(filePath)) {
        const fileInfo = fileMap.get(filePath);
        if (fileInfo) {
          fileInfo.chunkCount += 1;
        }
      } else {
        fileMap.set(filePath, { chunkCount: 1, category });
      }
    }

    return Array.from(fileMap.entries()).map(([filePath, info]) => ({
      filePath,
      chunkCount: info.chunkCount,
      category: info.category,
    }));
  } catch (error) {
    throw new Error(`Failed to list docs: ${error}`);
  }
}

/**
 * Get documentation statistics
 */
export async function getDocsStats(): Promise<{
  docCount: number;
  chunkCount: number;
  categories: Record<string, number>;
}> {
  const tbl = await getTable();

  try {
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
  } catch (error) {
    throw new Error(`Failed to get stats: ${error}`);
  }
}

/**
 * Close the database connection
 */
export async function closeDocsDatabase(): Promise<void> {
  db = null;
  table = null;
  ftsEnabled = false;
}
