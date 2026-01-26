/**
 * Sentence splitting logic for semantic chunking
 * Adapted from mcp-local-rag for Deno
 */

/**
 * Split text into sentences while preserving code blocks
 *
 * Features:
 * - Handles abbreviations (Dr., Mr., etc.)
 * - Preserves markdown code blocks intact
 * - Handles various punctuation marks
 *
 * @param text - The text to split
 * @returns Array of sentences
 */
export function splitIntoSentences(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Extract code blocks first and replace with placeholders
  const codeBlocks: string[] = [];
  const codeBlockRegex = /```[\s\S]*?```|`[^`]+`/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    codeBlocks.push(match[0]);
  }

  let textWithPlaceholders = text;
  for (let i = 0; i < codeBlocks.length; i++) {
    textWithPlaceholders = textWithPlaceholders.replace(
      codeBlocks[i]!,
      `__CODE_BLOCK_${i}__`,
    );
  }

  // Common abbreviations that don't end sentences
  const abbreviations = [
    "Dr",
    "Mr",
    "Mrs",
    "Ms",
    "Jr",
    "Sr",
    "Prof",
    "Ph.D",
    "M.D",
    "B.A",
    "M.A",
    "D.D.S",
    "etc",
    "i.e",
    "e.g",
    "vs",
    "v",
  ];

  // Build regex pattern for abbreviations
  const abbrevPattern = abbreviations.map((abbr) =>
    abbr.replace(/\./g, "\\.") + "\\."
  ).join("|");

  // Sentence boundary markers: . ! ?
  // But not when followed by lowercase (likely abbreviation)
  // And not when part of numbers (e.g., 3.14)
  const sentenceRegex = new RegExp(
    `(?<!\\d)([.!?]+)(?=\\s+[A-Z]|\\s*$)(?!(${abbrevPattern}))`,
    "g",
  );

  // Split by sentence boundaries
  const parts = textWithPlaceholders.split(sentenceRegex);

  // Reconstruct sentences (regex splits into parts, we need to rejoin)
  const sentences: string[] = [];
  let currentSentence = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue; // Skip undefined

    const trimmedPart = part.trim();
    if (trimmedPart.length === 0) continue; // Skip empty

    // If it's a punctuation mark, add to current sentence
    if (/^[.!?]+$/.test(trimmedPart)) {
      currentSentence += trimmedPart;
      sentences.push(currentSentence.trim());
      currentSentence = "";
    } else {
      // Add to current sentence
      currentSentence += (currentSentence.length > 0 ? " " : "") + trimmedPart;
    }
  }

  // Don't forget the last sentence if it doesn't end with punctuation
  if (currentSentence.trim().length > 0) {
    sentences.push(currentSentence.trim());
  }

  // Restore code blocks
  const finalSentences = sentences.map((sentence) => {
    let restored = sentence;
    for (let i = 0; i < codeBlocks.length; i++) {
      const block = codeBlocks[i];
      if (block) {
        restored = restored.replace(`__CODE_BLOCK_${i}__`, block);
      }
    }
    return restored;
  });

  // Filter out empty sentences and split overly long ones
  const MAX_SENTENCE_LENGTH = 2000; // Safe limit for embedding models
  const result: string[] = [];

  for (const sentence of finalSentences) {
    if (sentence.trim().length === 0) continue;

    // If sentence is too long, split it further by commas or newlines
    if (sentence.length > MAX_SENTENCE_LENGTH) {
      // Try splitting by newlines first
      const lines = sentence.split("\n");
      for (const line of lines) {
        if (line.trim().length === 0) continue;

        if (line.length > MAX_SENTENCE_LENGTH) {
          // Still too long, split by commas
          const parts = line.split(",");
          let buffer = "";
          for (const part of parts) {
            if (
              (buffer + part).length > MAX_SENTENCE_LENGTH && buffer.length > 0
            ) {
              result.push(buffer.trim());
              buffer = part;
            } else {
              buffer += (buffer.length > 0 ? "," : "") + part;
            }
          }
          if (buffer.trim().length > 0) {
            result.push(buffer.trim());
          }
        } else {
          result.push(line.trim());
        }
      }
    } else {
      result.push(sentence);
    }
  }

  return result.filter((s) => s.length > 0);
}
