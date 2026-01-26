/**
 * Metadata extraction utilities for example files
 */

import { type ExtractedMetadata } from "../types.ts";

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

/**
 * Determine language from file extension
 */
export function getLanguageFromExtension(extension: string): string {
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
  };
  return langMap[extension] || extension;
}

/**
 * Extract import statements from code
 * Returns both the full import statement and the package name
 */
export function extractImports(code: string): {
  imports: string[];
  dependencies: string[];
} {
  const imports: string[] = [];
  const dependencies = new Set<string>();

  // Match: import ... from "package-name"
  const importRegex =
    /import\s+(?:{[^}]+}|[\w\s,*]+)\s+from\s+["']([^"']+)["']/g;
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    imports.push(match[0]);
    const packageName = match[1];

    // Extract the package name (before any path separators)
    if (!packageName.startsWith(".")) {
      const pkgName = packageName.split("/")[0];
      if (pkgName.startsWith("@")) {
        // Scoped package like @modelcontextprotocol/sdk
        const scopedName = packageName.split("/").slice(0, 2).join("/");
        dependencies.add(scopedName);
      } else {
        dependencies.add(pkgName);
      }
    }
  }

  return {
    imports,
    dependencies: Array.from(dependencies),
  };
}

/**
 * Extract export statements from code
 */
export function extractExports(code: string): string[] {
  const exports: string[] = [];

  // Match: export function/class/const name
  const exportRegex =
    /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g;
  let match;

  while ((match = exportRegex.exec(code)) !== null) {
    exports.push(match[1]);
  }

  // Match: export default Name
  const defaultExportRegex = /export\s+default\s+(\w+)/g;
  while ((match = defaultExportRegex.exec(code)) !== null) {
    if (!exports.includes(match[1])) {
      exports.push(match[1]);
    }
  }

  return exports;
}

/**
 * Extract function names from code
 */
export function extractFunctions(code: string): string[] {
  const functions: string[] = [];

  // Match: function name(...) or const name = (...) =>
  const functionRegex =
    /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[\w]+)\s*=>)/g;
  let match;

  while ((match = functionRegex.exec(code)) !== null) {
    const funcName = match[1] || match[2];
    if (funcName && !functions.includes(funcName)) {
      functions.push(funcName);
    }
  }

  return functions;
}

/**
 * Extract keywords from code (variable names, function names, etc.)
 */
export function extractKeywords(code: string): string[] {
  const keywords = new Set<string>();

  // Extract camelCase and PascalCase identifiers
  const identifierRegex = /\b([a-z][a-zA-Z0-9]*|[A-Z][a-zA-Z0-9]*)\b/g;
  let match;

  while ((match = identifierRegex.exec(code)) !== null) {
    const word = match[1];
    // Filter out common keywords and short words
    if (word.length > 3 && !isCommonKeyword(word)) {
      keywords.add(word);
    }
  }

  return Array.from(keywords).slice(0, 50); // Limit to top 50 keywords
}

/**
 * Check if a word is a common programming keyword to filter out
 */
function isCommonKeyword(word: string): boolean {
  const common = [
    "const",
    "function",
    "return",
    "import",
    "export",
    "default",
    "async",
    "await",
    "void",
    "null",
    "undefined",
    "true",
    "false",
    "this",
    "class",
    "interface",
    "type",
    "enum",
  ];
  return common.includes(word.toLowerCase());
}

/**
 * Extract JSDoc or comment descriptions
 */
export function extractDescription(code: string): string {
  // Try to find JSDoc comment at the top of the file
  const jsdocRegex = /\/\*\*\s*\n?\s*\*?\s*([^\n*]+)/;
  const match = code.match(jsdocRegex);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Try to find single-line comment
  const commentRegex = /^\/\/\s*(.+)$/m;
  const commentMatch = code.match(commentRegex);
  if (commentMatch && commentMatch[1]) {
    return commentMatch[1].trim();
  }

  return "";
}

/**
 * Extract all metadata from a code file
 */
export function extractMetadata(
  filePath: string,
  code: string,
): ExtractedMetadata {
  const { category, name } = extractPathMetadata(filePath);
  const extension = filePath.split(".").pop() || "ts";

  const { dependencies } = extractImports(code);
  const keywords = extractKeywords(code);
  const description = extractDescription(code) || `${name} example`;

  return {
    name,
    description,
    extension,
    category,
    keywords,
    dependencies,
  };
}
