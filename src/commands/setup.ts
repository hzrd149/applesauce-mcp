/**
 * Setup command - Clone applesauce repository and ingest all data
 */

import { Command } from "@cliffy/command";
import { cloneApplesauceRepo, isApplesauceRepoValid } from "../lib/git.ts";
import { ingestDocs, ingestExamples } from "./ingest.ts";

/**
 * Main setup function that clones repo and runs ingestion.
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

  // Step 2: Run ingestion (docs + examples embeddings for search)
  console.log("Step 2: Ingesting documentation and examples...\n");

  await ingestDocs();
  await ingestExamples();

  console.log("Setup complete! You can now start the MCP server.");
}

export default new Command()
  .description("Set up the applesauce repository and ingest docs + examples")
  .action(runSetup);
