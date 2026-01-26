/**
 * LanceDB database setup and operations
 */

import * as lancedb from "@lancedb/lancedb";
import { type ExampleRecord, type SearchParams } from "../types.ts";

const DB_PATH = "./data/lancedb";
const TABLE_NAME = "examples";

let db: lancedb.Connection | null = null;
let table: lancedb.Table | null = null;

/**
 * Initialize the LanceDB connection and table
 */
export async function initDatabase(): Promise<void> {
  db = await lancedb.connect(DB_PATH);

  // Check if table exists
  const tableNames = await db.tableNames();

  if (tableNames.includes(TABLE_NAME)) {
    table = await db.openTable(TABLE_NAME);
  } else {
    // Table will be created on first insert
  }
}

/**
 * Create or get the examples table
 */
async function getTable(): Promise<lancedb.Table> {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }

  if (table) {
    return table;
  }

  // Create table with first record (will be called during ingestion)
  throw new Error("Table does not exist yet. Insert records first.");
}

/**
 * Insert or update an example in the database
 */
export async function upsertExample(example: ExampleRecord): Promise<void> {
  if (!db) {
    throw new Error("Database not initialized");
  }

  try {
    if (!table) {
      // Create table with first record
      table = await db.createTable(TABLE_NAME, [
        example as unknown as Record<string, unknown>,
      ]);
      console.log(`✓ Created table: ${TABLE_NAME}`);
    } else {
      // Add the record
      await table.add([example as unknown as Record<string, unknown>]);
    }
  } catch (error) {
    console.error(`Failed to upsert example ${example.id}:`, error);
    throw error;
  }
}

/**
 * Search examples using vector similarity and optional filters
 */
export async function searchExamples(
  params: SearchParams,
  queryVector: number[],
): Promise<ExampleRecord[]> {
  const tbl = await getTable();

  let query = tbl.search(queryVector).limit(params.limit || 5);

  // No filters needed - just semantic search

  // Execute and return results
  const results: ExampleRecord[] = [];
  for await (const batch of query) {
    for (const record of batch) {
      results.push(record as unknown as ExampleRecord);
    }
  }
  return results;
}

/**
 * Get a specific example by name
 */
export async function getExampleByName(
  name: string,
): Promise<ExampleRecord | null> {
  const tbl = await getTable();

  // Use search with dummy vector and filter by name
  const dummyVector = new Array(768).fill(0);
  const query = tbl.search(dummyVector).where(`name = '${name}'`).limit(1);

  // Execute query and get results
  for await (const batch of query) {
    for (const record of batch) {
      return record as unknown as ExampleRecord;
    }
  }

  return null;
}

/**
 * List all examples in the database
 */
export async function listAllExamples(): Promise<ExampleRecord[]> {
  const tbl = await getTable();

  // Use search with dummy vector to get all records
  const dummyVector = new Array(768).fill(0);
  const query = tbl.search(dummyVector).limit(10000);

  // Execute query to get all results
  const results: ExampleRecord[] = [];
  for await (const batch of query) {
    for (const record of batch) {
      results.push(record as unknown as ExampleRecord);
    }
  }
  return results;
}

/**
 * List all unique categories in the database
 */
export async function listCategories(): Promise<
  Array<{ category: string; count: number }>
> {
  const tbl = await getTable();

  // Get all examples
  const dummyVector = new Array(768).fill(0);
  const query = tbl.search(dummyVector).limit(10000);

  // Group by category
  const categoryMap = new Map<string, number>();
  for await (const batch of query) {
    for (const example of batch) {
      const record = example as unknown as ExampleRecord;
      const count = categoryMap.get(record.category) || 0;
      categoryMap.set(record.category, count + 1);
    }
  }

  return Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get total count of examples
 */
export async function getExampleCount(): Promise<number> {
  const tbl = await getTable();
  return await tbl.countRows();
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  // LanceDB doesn't require explicit closing in the current version
  db = null;
  table = null;
}
