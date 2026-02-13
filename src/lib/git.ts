/**
 * Git repository management utilities for Applesauce
 */

import { exists } from "@std/fs";
import { APPLESAUCE_LOCAL_PATH, APPLESAUCE_REPO_URL } from "../const.ts";
import * as logger from "./logger.ts";

export interface GitResult {
  success: boolean;
  message: string;
  hasChanges?: boolean; // Whether the operation resulted in changes
}

/**
 * Check if the applesauce repository exists and is a valid git repository
 */
export async function isApplesauceRepoValid(): Promise<boolean> {
  try {
    const repoPath = APPLESAUCE_LOCAL_PATH;
    const gitPath = `${repoPath}/.git`;

    // Check if directory exists
    if (!await exists(repoPath)) {
      return false;
    }

    // Check if it's a git repository
    if (!await exists(gitPath)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Clone the applesauce repository to the configured path (default: ./data/applesauce)
 * If directory exists and is a git repo, skip cloning
 * If directory exists but is not a git repo, throw error
 */
export async function cloneApplesauceRepo(): Promise<void> {
  const repoPath = APPLESAUCE_LOCAL_PATH;

  // Check if directory already exists
  if (await exists(repoPath)) {
    // Check if it's a valid git repo
    if (await isApplesauceRepoValid()) {
      logger.log("Repository already exists, skipping clone");
      return;
    } else {
      throw new Error(
        `Directory ${repoPath} exists but is not a git repository. Please remove it and try again.`,
      );
    }
  }

  // Clone the repository with shallow clone for faster initial setup
  logger.log(`Cloning ${APPLESAUCE_REPO_URL} to ${repoPath}...`);

  const command = new Deno.Command("git", {
    args: ["clone", "--depth", "1", APPLESAUCE_REPO_URL, repoPath],
    stdout: "inherit",
    stderr: "inherit",
  });

  const { code } = await command.output();

  if (code !== 0) {
    throw new Error(`Failed to clone repository (exit code: ${code})`);
  }

  logger.log("Repository cloned successfully");
}

/**
 * Update the applesauce repository by pulling latest changes
 * Ignores errors and returns success/failure status
 */
export async function updateApplesauceRepo(): Promise<GitResult> {
  const repoPath = APPLESAUCE_LOCAL_PATH;

  // Verify repo exists
  if (!await isApplesauceRepoValid()) {
    return {
      success: false,
      message: "Repository not found. Run setup first.",
    };
  }

  try {
    // Run git pull and capture output to detect changes
    const command = new Deno.Command("git", {
      args: ["pull", "origin"],
      cwd: repoPath,
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();

    if (code !== 0) {
      // Print stderr for debugging
      const errorText = new TextDecoder().decode(stderr);
      logger.error(errorText);
      return {
        success: false,
        message: `Git pull failed with exit code ${code}`,
        hasChanges: false,
      };
    }

    // Check output to see if there were changes
    const outputText = new TextDecoder().decode(stdout);
    const errorText = new TextDecoder().decode(stderr);
    const fullOutput = outputText + errorText;

    // Print the output
    logger.log(fullOutput);

    // "Already up to date" means no changes
    const hasChanges = !fullOutput.includes("Already up to date") &&
      !fullOutput.includes("Already up-to-date");

    return {
      success: true,
      message: hasChanges
        ? "Repository updated with new changes"
        : "Repository already up to date",
      hasChanges,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Git pull failed: ${message}`,
      hasChanges: false,
    };
  }
}

/**
 * Checkout a specific tag or branch in the applesauce repository
 */
export async function checkoutApplesauceTag(tag: string): Promise<GitResult> {
  const repoPath = APPLESAUCE_LOCAL_PATH;

  // Verify repo exists
  if (!await isApplesauceRepoValid()) {
    return {
      success: false,
      message: "Repository not found. Run setup first.",
    };
  }

  try {
    // First, fetch all tags if this is a shallow clone
    const fetchCommand = new Deno.Command("git", {
      args: ["fetch", "--depth", "1", "origin", `tag`, tag],
      cwd: repoPath,
      stdout: "inherit",
      stderr: "inherit",
    });

    await fetchCommand.output();

    // Checkout the tag
    const checkoutCommand = new Deno.Command("git", {
      args: ["checkout", tag],
      cwd: repoPath,
      stdout: "inherit",
      stderr: "inherit",
    });

    const { code } = await checkoutCommand.output();

    if (code !== 0) {
      return {
        success: false,
        message: `Git checkout failed with exit code ${code}`,
      };
    }

    return {
      success: true,
      message: `Successfully checked out tag: ${tag}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Git checkout failed: ${message}`,
    };
  }
}
