/**
 * Docs service: list and read documentation files from the applesauce repo (filesystem).
 * Uses DOCS_ROOT from const.ts and git.ts for repo validity, mirroring lib/examples.ts.
 */

import { exists } from "@std/fs";
import { walk } from "@std/fs/walk";
import { extractYaml, test as hasFrontMatter } from "@std/front-matter";
import { relative, resolve } from "@std/path";
import { DOCS_ROOT } from "../const.ts";
import { isApplesauceRepoValid } from "./git.ts";

/** Doc info for listing (path, category, optional title/description from front-matter) */
export interface DocInfo {
  id: string;
  category: string;
  title?: string;
  description?: string;
}

/** Full doc content for reading */
export interface DocContent {
  text: string;
  title?: string;
  description?: string;
}

/** Match .md files */
const DOC_FILE_REGEX = /\.md$/;

/** Strip .md extension from path to form doc id (e.g. "core/event-store.md" -> "core/event-store"). */
function pathToId(path: string): string {
  return path.replace(/\\/g, "/").replace(/\.md$/i, "");
}

/** Derive category from id or path (e.g. "core/event-store" -> "core"). */
function categoryFromPath(pathOrId: string): string {
  const parts = pathOrId.replace(/\\/g, "/").split("/");
  return parts.length > 1 ? parts[0] : "unknown";
}

/** Front-matter attrs and body extracted via @std/front-matter (YAML). */
interface ParsedFrontMatter {
  title?: string;
  description?: string;
  body: string;
}

/** Extract title, description, and body using @std/front-matter (YAML). */
function parseFrontMatter(content: string): ParsedFrontMatter {
  if (!hasFrontMatter(content)) {
    return { body: content };
  }
  try {
    const { attrs, body } = extractYaml<Record<string, unknown>>(content);
    const title = typeof attrs?.title === "string"
      ? attrs.title.trim()
      : undefined;
    const description = typeof attrs?.description === "string"
      ? attrs.description.trim()
      : undefined;
    return { title, description, body };
  } catch {
    return { body: content };
  }
}

/**
 * List all documentation pages from the applesauce repo filesystem.
 * Returns doc id (path without .md), category (first path segment), and optional title/description from front-matter.
 *
 * @returns Array of doc info, or throws if repo is missing/invalid
 */
export async function listDocs(): Promise<DocInfo[]> {
  if (!await isApplesauceRepoValid()) {
    throw new Error(
      "Applesauce repository not found. Please run 'applesauce-mcp setup' first.",
    );
  }

  const results: DocInfo[] = [];

  for await (
    const entry of walk(DOCS_ROOT, {
      includeDirs: false,
      match: [DOC_FILE_REGEX],
    })
  ) {
    if (!entry.path || !entry.isFile) continue;

    const id = pathToId(relative(DOCS_ROOT, entry.path));
    const category = categoryFromPath(id);

    let title: string | undefined;
    let description: string | undefined;
    try {
      const content = await Deno.readTextFile(entry.path);
      const parsed = parseFrontMatter(content);
      title = parsed.title;
      description = parsed.description;
    } catch {
      // ignore read errors; title/description stay undefined
    }

    results.push({ id: id, category, title, description });
  }

  results.sort((a, b) => a.id.localeCompare(b.id));
  return results;
}

/**
 * Read a single documentation page by its id (relative to DOCS_ROOT, without .md extension).
 * Validates path is under DOCS_ROOT and strips front-matter from output.
 *
 * @param id - Doc id without extension (e.g. "core/event-store")
 * @returns Doc content or null if not found / invalid
 */
export async function readDoc(id: string): Promise<DocContent | null> {
  if (!await isApplesauceRepoValid()) {
    return null;
  }

  const filePath = id.endsWith(".md") ? id : `${id}.md`;
  const fullPath = resolve(DOCS_ROOT, filePath);
  const absoluteDocsRoot = resolve(DOCS_ROOT);

  if (!fullPath.startsWith(absoluteDocsRoot)) {
    return null;
  }

  if (!await exists(fullPath)) {
    return null;
  }

  try {
    const content = await Deno.readTextFile(fullPath);
    const { title, description, body } = parseFrontMatter(content);
    return { text: body, title, description };
  } catch {
    return null;
  }
}
