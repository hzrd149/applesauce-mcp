/**
 * Ollama embedding client using the official ollama package
 *
 * Recommended embedding models:
 * - nomic-embed-text (best for code/text, 768 dims)
 * - all-minilm (lightweight, 384 dims)
 * - mxbai-embed-large (high quality, 1024 dims)
 */

import ollama from "ollama";

// Use nomic-embed-text as recommended in Ollama docs for semantic search
const EMBEDDING_MODEL = "nomic-embed-text:v1.5";

/**
 * Generate embeddings using Ollama
 * Returns L2-normalized (unit-length) vectors from the /api/embed endpoint
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await ollama.embed({
      model: EMBEDDING_MODEL,
      input: text,
    });

    // The ollama package returns { embeddings: number[][] }
    // For single input, we get a single embedding vector
    return response.embeddings[0];
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Generate multiple embeddings in a batch (more efficient than individual calls)
 */
export async function generateEmbeddingsBatch(
  texts: string[],
): Promise<number[][]> {
  try {
    const response = await ollama.embed({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    return response.embeddings;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate batch embeddings: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Check if Ollama is running and the embedding model is available
 */
export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const models = await ollama.list();

    // Check if the embedding model is in the list
    return models.models.some(
      (m: { name: string }) =>
        m.name.includes(EMBEDDING_MODEL) ||
        m.name.includes(EMBEDDING_MODEL.replace("-text", "")),
    );
  } catch {
    return false;
  }
}

/**
 * Generate embedding text from example metadata and code
 *
 * Note: nomic-embed-text has a context window of ~8192 tokens (~32k chars).
 * We limit code to first 6000 chars to leave room for metadata and stay safe.
 */
export function createEmbeddingText(
  name: string,
  description: string,
  category: string,
  code: string,
): string {
  // Limit code length to avoid exceeding model's context window
  const MAX_CODE_CHARS = 6000;
  const truncatedCode = code.length > MAX_CODE_CHARS
    ? code.substring(0, MAX_CODE_CHARS) + "\n\n// ... (truncated)"
    : code;

  // Combine metadata and code for embedding
  // Prioritize metadata as it's more descriptive
  return `${name}\n${description}\n${category}\n\n${truncatedCode}`;
}
