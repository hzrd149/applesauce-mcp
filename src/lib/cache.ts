/**
 * Cache directory management for cross-platform support
 *
 * Provides OS-appropriate cache directory paths following platform conventions:
 * - Linux: ~/.cache/applesauce-mcp
 * - macOS: ~/Library/Caches/applesauce-mcp
 * - Windows: %LOCALAPPDATA%/applesauce-mcp
 */

import { join } from "@std/path";
import { exists } from "@std/fs";

/**
 * Get the OS-appropriate cache directory for applesauce-mcp
 *
 * @returns Absolute path to the cache directory
 * @throws Error if HOME or LOCALAPPDATA environment variable is not set
 */
export function getCacheDir(): string {
  const os = Deno.build.os;
  let baseDir: string | undefined;

  switch (os) {
    case "linux":
    case "freebsd":
    case "netbsd":
    case "aix":
    case "solaris":
    case "illumos": {
      // Unix-like systems: use XDG_CACHE_HOME or ~/.cache
      const xdgCache = Deno.env.get("XDG_CACHE_HOME");
      if (xdgCache) {
        baseDir = xdgCache;
      } else {
        const home = Deno.env.get("HOME");
        if (!home) {
          throw new Error("HOME environment variable is not set");
        }
        baseDir = join(home, ".cache");
      }
      break;
    }

    case "darwin": {
      // macOS: use ~/Library/Caches
      const home = Deno.env.get("HOME");
      if (!home) {
        throw new Error("HOME environment variable is not set");
      }
      baseDir = join(home, "Library", "Caches");
      break;
    }

    case "windows": {
      // Windows: use %LOCALAPPDATA%
      const localAppData = Deno.env.get("LOCALAPPDATA");
      if (!localAppData) {
        throw new Error("LOCALAPPDATA environment variable is not set");
      }
      baseDir = localAppData;
      break;
    }

    default: {
      // Fallback for unknown OS
      const home = Deno.env.get("HOME");
      if (!home) {
        throw new Error(
          `Unsupported OS: ${os}. HOME environment variable is not set`,
        );
      }
      baseDir = join(home, ".cache");
      break;
    }
  }

  return join(baseDir, "applesauce-mcp");
}

/**
 * Ensure the cache directory exists, creating it if necessary
 *
 * @returns Absolute path to the cache directory
 */
export async function ensureCacheDir(): Promise<string> {
  const cacheDir = getCacheDir();

  if (!await exists(cacheDir)) {
    await Deno.mkdir(cacheDir, { recursive: true });
  }

  return cacheDir;
}

/**
 * Get the default repository path (cache_dir/applesauce)
 *
 * @returns Absolute path to where the applesauce repo should be cloned
 */
export function getDefaultRepoPath(): string {
  return join(getCacheDir(), "applesauce");
}

/**
 * Get the default database path (same as cache dir for LanceDB databases)
 *
 * @returns Absolute path to where LanceDB databases should be stored
 */
export function getDefaultDbPath(): string {
  return getCacheDir();
}
