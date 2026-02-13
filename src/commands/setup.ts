/**
 * Setup command - Clone applesauce repository and rebuild all databases
 */

import { Command } from "@cliffy/command";
import { APPLESAUCE_LOCAL_PATH, DB_PATH } from "../const.ts";
import { cloneApplesauceRepo, isApplesauceRepoValid } from "../lib/git.ts";
import * as logger from "../lib/logger.ts";
import { rebuildDocs, rebuildExamples, rebuildMethods } from "./rebuild.ts";

/**
 * Main setup function that clones repo and rebuilds databases.
 * Exported for use by the MCP command when repo is not set up.
 */
export async function runSetup(): Promise<void> {
  logger.log("Setting up Applesauce MCP...\n");
  logger.log(`📁 Data storage locations:`);
  logger.log(`   Repository: ${APPLESAUCE_LOCAL_PATH}`);
  logger.log(`   Database: ${DB_PATH}\n`);

  // Step 1: Check if repo already exists
  const repoExists = await isApplesauceRepoValid();

  if (!repoExists) {
    logger.log("Step 1: Cloning applesauce repository...");
    await cloneApplesauceRepo();
    logger.log("Repository cloned successfully\n");
  } else {
    logger.log(
      "Step 1: Applesauce repository already exists, skipping clone\n",
    );
  }

  // Step 2: Build databases (docs + examples + methods embeddings for search)
  logger.log("Step 2: Building documentation and examples databases...\n");

  await rebuildDocs();
  await rebuildExamples();
  await rebuildMethods();

  logger.log("Setup complete! You can now start the MCP server.");
}

export default new Command()
  .description(
    "Set up the applesauce repository and build docs + examples databases",
  )
  .action(runSetup);
