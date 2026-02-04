/**
 * Examples service: list and read example files from the applesauce repo (filesystem).
 * Uses the local clone path from const.ts and git.ts for repo validity.
 */

import { exists } from "@std/fs";
import { walk } from "@std/fs/walk";
import { relative } from "@std/path";
import { EXAMPLES_ROOT } from "../const.ts";
import { isApplesauceRepoValid } from "./git.ts";
import { parseMetadata } from "./jsdoc-metadata.ts";

/** Minimal example info for listing (e.g. MCP resources) */
export interface ExampleInfo {
  name: string;
  description?: string;
}

/** Full example content for reading */
export interface ExampleContent {
  code: string;
  description?: string;
}

/** Match .ts and .tsx example files */
const EXAMPLE_FILE_REGEX = /\.(ts|tsx)$/;
const EXAMPLE_EXTENSIONS = [".ts", ".tsx"];

/**
 * List all examples from the applesauce repo filesystem.
 * Returns name (path without extension) and optional description from file header.
 *
 * @returns Array of example info, or empty if repo is missing/invalid
 */
export async function listExamples(): Promise<ExampleInfo[]> {
  if (!await isApplesauceRepoValid()) {
    throw new Error(
      "Applesauce repository not found. Please run 'applesauce-mcp setup' first.",
    );
  }

  const results: ExampleInfo[] = [];

  for await (
    const entry of walk(EXAMPLES_ROOT, {
      includeDirs: false,
      match: [EXAMPLE_FILE_REGEX],
    })
  ) {
    if (!entry.path || !entry.isFile) continue;

    const relativePath = relative(EXAMPLES_ROOT, entry.path);
    const name = relativePath.replace(/\.[^.]+$/, "");

    let description: string | undefined;
    try {
      const content = await Deno.readTextFile(entry.path);
      const { metadata } = parseMetadata(content);
      if (metadata?.description) {
        description = metadata.description;
      }
    } catch {
      // ignore read errors; description stays undefined
    }

    results.push({ name, description });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

/**
 * Read a single example by name (e.g. "casting/threads").
 * Resolves .ts then .tsx under EXAMPLES_ROOT.
 *
 * @param name - Example name (path without extension)
 * @returns Example content and optional description, or null if not found
 */
export async function readExample(
  name: string,
): Promise<ExampleContent | null> {
  if (!await isApplesauceRepoValid()) {
    return null;
  }

  const basePath = `${EXAMPLES_ROOT}/${name}`;
  let path: string | null = null;

  for (const ext of EXAMPLE_EXTENSIONS) {
    const candidate = `${basePath}${ext}`;
    if (await exists(candidate)) {
      path = candidate;
      break;
    }
  }

  if (!path) return null;

  try {
    const code = await Deno.readTextFile(path);
    const { metadata } = parseMetadata(code);
    const description = metadata?.description || undefined;
    return { code, description };
  } catch {
    return null;
  }
}
