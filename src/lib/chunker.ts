/**
 * Semantic chunker using Max-Min algorithm
 * Based on "Max–Min semantic chunking of documents for RAG application" (Springer, 2025)
 * Adapted from mcp-local-rag for Deno with Ollama embeddings
 */

import type { ChunkerConfig, EmbedderInterface, TextChunk } from "../types.ts";
import { splitIntoSentences } from "./sentence-splitter.ts";

/**
 * Performance optimization constants
 */
const WINDOW_SIZE = 5; // Recent sentences to compare (reduces O(k²) to O(1))
const MAX_SENTENCES = 15; // Force split safety limit

/**
 * Default configuration based on paper recommendations
 */
export const DEFAULT_CHUNKER_CONFIG: ChunkerConfig = {
  hardThreshold: 0.6,
  initConst: 1.5,
  c: 0.9,
  minChunkLength: 50,
};

/**
 * Check if a chunk is garbage (should be filtered out)
 *
 * Criteria (language-agnostic):
 * 1. Empty after trimming
 * 2. Contains alphanumeric -> valid content (keep)
 * 3. Only decoration characters (----, ====, etc.) -> garbage
 * 4. Single character repeated >80% of text -> garbage
 *
 * @param text - Chunk text to check
 * @returns true if chunk is garbage and should be removed
 */
export function isGarbageChunk(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  // If contains any alphanumeric, consider valid content
  if (/[a-zA-Z0-9]/.test(trimmed)) return false;

  // Decoration line patterns only (----, ====, ****, etc.)
  if (/^[\-=_.*#|~`@!%^&*()\[\]{}\\/<>:+\s]+$/.test(trimmed)) return true;

  // Excessive repetition of single character (>80%)
  const charCounts = new Map<string, number>();
  for (const char of trimmed) {
    charCounts.set(char, (charCounts.get(char) ?? 0) + 1);
  }
  const maxCount = Math.max(...charCounts.values());
  if (maxCount / trimmed.length > 0.8) return true;

  return false;
}

/**
 * Semantic chunker using Max-Min algorithm
 *
 * The algorithm groups consecutive sentences based on semantic similarity:
 * 1. Split text into sentences
 * 2. Generate embeddings for all sentences
 * 3. For each sentence, decide whether to add to current chunk or start new chunk
 * 4. Decision is based on comparing max similarity with new sentence vs min similarity within chunk
 *
 * Key insight: A sentence belongs to a chunk if its maximum similarity to any chunk member
 * is greater than the minimum similarity between existing chunk members (with threshold adjustment)
 */
export class SemanticChunker {
  private readonly config: ChunkerConfig;

  constructor(config: Partial<ChunkerConfig> = {}) {
    this.config = { ...DEFAULT_CHUNKER_CONFIG, ...config };
  }

  /**
   * Split text into semantically coherent chunks
   *
   * @param text - The text to chunk
   * @param embedder - Embedder to generate sentence embeddings
   * @returns Array of text chunks
   */
  async chunkText(
    text: string,
    embedder: EmbedderInterface,
  ): Promise<TextChunk[]> {
    // Handle empty input
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Split into sentences
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) {
      return [];
    }

    // Generate embeddings for all sentences
    const embeddings = await embedder.embedBatch(sentences);

    // Apply Max-Min algorithm to group sentences into chunks
    const sentenceGroups = this.groupSentences(sentences, embeddings);

    // Convert groups to TextChunks
    const chunks: TextChunk[] = [];
    let chunkIndex = 0;

    for (const group of sentenceGroups) {
      const chunkText = group.join(" ");

      // Filter out chunks that are too short or garbage
      if (
        chunkText.length >= this.config.minChunkLength &&
        !isGarbageChunk(chunkText)
      ) {
        chunks.push({
          text: chunkText,
          index: chunkIndex,
        });
        chunkIndex++;
      }
    }

    return chunks;
  }

  /**
   * Group sentences into chunks using Max-Min algorithm
   */
  private groupSentences(
    sentences: string[],
    embeddings: number[][],
  ): string[][] {
    if (sentences.length === 0) return [];
    if (sentences.length === 1) return [[sentences[0]!]];

    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let currentGroupEmbeddings: number[][] = [];

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const embedding = embeddings[i];

      if (!sentence || !embedding) continue;

      if (currentGroup.length === 0) {
        // Start new group with first sentence
        currentGroup.push(sentence);
        currentGroupEmbeddings.push(embedding);
      } else if (currentGroup.length === 1) {
        // Special case for second sentence (init phase)
        const firstEmbedding = currentGroupEmbeddings[0];
        if (!firstEmbedding) continue;

        const similarity = this.cosineSimilarity(firstEmbedding, embedding);

        if (this.config.initConst * similarity > this.config.hardThreshold) {
          // Add to current group
          currentGroup.push(sentence);
          currentGroupEmbeddings.push(embedding);
        } else {
          // Start new group
          groups.push([...currentGroup]);
          currentGroup = [sentence];
          currentGroupEmbeddings = [embedding];
        }
      } else {
        // Force split if chunk reaches MAX_SENTENCES (safety limit for performance)
        if (currentGroup.length >= MAX_SENTENCES) {
          groups.push([...currentGroup]);
          currentGroup = [sentence];
          currentGroupEmbeddings = [embedding];
          continue;
        }

        // Normal case: check if sentence should join current group
        const shouldAdd = this.shouldAddToChunk(
          embedding,
          currentGroupEmbeddings,
        );

        if (shouldAdd) {
          currentGroup.push(sentence);
          currentGroupEmbeddings.push(embedding);
        } else {
          // Start new group
          groups.push([...currentGroup]);
          currentGroup = [sentence];
          currentGroupEmbeddings = [embedding];
        }
      }
    }

    // Don't forget the last group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Decide if a sentence should be added to the current chunk
   * Based on Max-Min algorithm from the paper
   */
  private shouldAddToChunk(
    newEmbedding: number[],
    chunkEmbeddings: number[][],
  ): boolean {
    // Calculate min similarity within current chunk
    const minSim = this.getMinSimilarity(chunkEmbeddings);

    // Calculate max similarity between new sentence and chunk
    const maxSim = this.getMaxSimilarity(newEmbedding, chunkEmbeddings);

    // Calculate dynamic threshold
    const threshold = this.calculateThreshold(minSim, chunkEmbeddings.length);

    return maxSim > threshold;
  }

  /**
   * Get minimum pairwise similarity within a chunk.
   * Only compares the last WINDOW_SIZE sentences for O(1) complexity.
   * This approximation is valid because recent sentences are most relevant
   * for determining chunk coherence (per Max-Min paper's experimental setup).
   */
  private getMinSimilarity(embeddings: number[][]): number {
    if (embeddings.length < 2) return 1.0;

    // Only compare the last WINDOW_SIZE embeddings to reduce O(k²) to O(1)
    const startIdx = Math.max(0, embeddings.length - WINDOW_SIZE);
    const windowEmbeddings = embeddings.slice(startIdx);

    let minSim = 1.0;
    for (let i = 0; i < windowEmbeddings.length; i++) {
      for (let j = i + 1; j < windowEmbeddings.length; j++) {
        const embI = windowEmbeddings[i];
        const embJ = windowEmbeddings[j];
        if (!embI || !embJ) continue;

        const sim = this.cosineSimilarity(embI, embJ);
        if (sim < minSim) {
          minSim = sim;
        }
      }
    }
    return minSim;
  }

  /**
   * Get maximum similarity between a sentence and any sentence in the chunk
   */
  private getMaxSimilarity(
    embedding: number[],
    chunkEmbeddings: number[][],
  ): number {
    let maxSim = -1.0;
    for (const chunkEmb of chunkEmbeddings) {
      const sim = this.cosineSimilarity(embedding, chunkEmb);
      if (sim > maxSim) {
        maxSim = sim;
      }
    }
    return maxSim;
  }

  /**
   * Calculate dynamic threshold based on chunk size
   * threshold = max(c * minSim * sigmoid(|C|), hardThreshold)
   */
  private calculateThreshold(minSim: number, chunkSize: number): number {
    const sigmoidValue = this.sigmoid(chunkSize);
    const dynamicThreshold = this.config.c * minSim * sigmoidValue;
    return Math.max(dynamicThreshold, this.config.hardThreshold);
  }

  /**
   * Sigmoid function
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length || vec1.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      const v1 = vec1[i] ?? 0;
      const v2 = vec2[i] ?? 0;
      dotProduct += v1 * v2;
      norm1 += v1 * v1;
      norm2 += v2 * v2;
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }
}
