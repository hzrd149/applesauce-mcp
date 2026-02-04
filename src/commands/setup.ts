/**
 * Setup command - Clone applesauce repository and rebuild all databases
 */

import { Command } from "@cliffy/command";
import { cloneApplesauceRepo, isApplesauceRepoValid } from "../lib/git.ts";
import { rebuildDocs, rebuildExamples, rebuildMethods } from "./rebuild.ts";

/**
 * Main setup function that clones repo and rebuilds databases.
 * Exported for use by the MCP command when repo is not set up.
 */
export async function runSetup(): Promise<void> {
  console.log("Setting up Applesauce MCP...\n");

  // Step 1: Check if repo already exists
  const repoExists = await isApplesauceRepoValid();

  if (!repoExists) {
    console.log("Step 1: Cloning applesauce repository...");
    await cloneApplesauceRepo();
    console.log("Repository cloned successfully\n");
  } else {
    console.log(
      "Step 1: Applesauce repository already exists, skipping clone\n",
    );
  }

  // Step 2: Build databases (docs + examples + methods embeddings for search)
  console.log("Step 2: Building documentation and examples databases...\n");

  await rebuildDocs();
  await rebuildExamples();
  await rebuildMethods();

  console.log("Setup complete! You can now start the MCP server.");
}

export default new Command()
  .description(
    "Set up the applesauce repository and build docs + examples databases",
  )
  .action(runSetup);
