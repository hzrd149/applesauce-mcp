/**
 * Metadata extraction utilities for example files
 */

/**
 * Extract metadata from file path
 * Example relative paths:
 *   - casting/threads.tsx -> { category: "casting", name: "casting/threads" }
 *   - cache/window.nostrdb.tsx -> { category: "cache", name: "cache/window.nostrdb" }
 */
export function extractPathMetadata(filePath: string): {
  category: string;
  name: string;
} {
  // Extract category and name from relative path
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1];

  // Remove extension to get the final name
  const nameWithoutExt = fileName.replace(/\.(tsx?|jsx?)$/, "");

  // Name is the full path without extension (e.g., "casting/threads")
  const pathParts = [...parts.slice(0, -1), nameWithoutExt];
  const name = pathParts.join("/");

  // Category is the first directory in the relative path
  // If file is in root, category is "uncategorized"
  let category = "uncategorized";
  if (parts.length > 1) {
    category = parts[0];
  }

  return { category, name };
}
