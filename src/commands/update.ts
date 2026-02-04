/**
 * Update command - Update applesauce repository to latest or specific tag
 */

import { Command } from "@cliffy/command";
import {
  checkoutApplesauceTag,
  isApplesauceRepoValid,
  updateApplesauceRepo,
} from "../lib/git.ts";
import { rebuildDocs, rebuildExamples, rebuildMethods } from "./rebuild.ts";

/**
 * Update the applesauce repository
 */
async function update(options: {
  tag?: string;
  skipRebuild?: boolean;
}): Promise<void> {
  // Verify repo exists
  const repoExists = await isApplesauceRepoValid();
  if (!repoExists) {
    console.error(
      "Error: Applesauce repository not found. Run 'applesauce-mcp setup' first.",
    );
    Deno.exit(1);
  }

  let updateSuccessful = false;
  let hasChanges = false;

  if (options.tag) {
    console.log(`Checking out tag: ${options.tag}`);
    const result = await checkoutApplesauceTag(options.tag);
    console.log(result.message);
    if (!result.success) {
      console.log("Note: Continuing despite git error");
    } else {
      updateSuccessful = true;
      // For tag checkout, always assume changes (we don't track this)
      hasChanges = true;
    }
  } else {
    console.log("Updating to latest version...");
    const result = await updateApplesauceRepo();
    console.log(result.message);
    if (!result.success) {
      console.log("Note: Continuing despite git error");
    } else {
      updateSuccessful = true;
      hasChanges = result.hasChanges || false;
    }
  }

  // Automatically rebuild databases after successful update with changes
  if (updateSuccessful && hasChanges && !options.skipRebuild) {
    console.log(
      "\nRebuilding databases with updated content...\n",
    );
    try {
      await rebuildDocs();
      await rebuildExamples();
      await rebuildMethods();
      console.log("\n✓ Databases rebuilt successfully");
    } catch (error) {
      console.error(
        "\n⚠ Failed to rebuild databases:",
        error instanceof Error ? error.message : error,
      );
      console.log(
        "You can manually rebuild later with: applesauce-mcp rebuild",
      );
      Deno.exit(1);
    }
  } else if (updateSuccessful && hasChanges && options.skipRebuild) {
    console.log(
      "\nSkipped database rebuild. Run 'applesauce-mcp rebuild' to update the databases.",
    );
  } else if (updateSuccessful && !hasChanges) {
    console.log(
      "\nNo changes detected, skipping database rebuild.",
    );
  }
}

export default new Command()
  .description(
    "Update the applesauce repository and rebuild databases",
  )
  .option("--tag <tag:string>", "Checkout a specific tag or branch")
  .option(
    "--skip-rebuild",
    "Skip automatic database rebuild after update",
  )
  .action(update);
