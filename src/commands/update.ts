/**
 * Update command - Update applesauce repository to latest or specific tag
 */

import { Command } from "@cliffy/command";
import {
  checkoutApplesauceTag,
  isApplesauceRepoValid,
  updateApplesauceRepo,
} from "../lib/git.ts";

/**
 * Update the applesauce repository
 */
async function update(options: { tag?: string }): Promise<void> {
  // Verify repo exists
  const repoExists = await isApplesauceRepoValid();
  if (!repoExists) {
    console.error(
      "Error: Applesauce repository not found. Run 'applesauce-mcp setup' first.",
    );
    Deno.exit(1);
  }

  if (options.tag) {
    console.log(`Checking out tag: ${options.tag}`);
    const result = await checkoutApplesauceTag(options.tag);
    console.log(result.message);
    if (!result.success) {
      console.log("Note: Continuing despite git error");
    }
  } else {
    console.log("Updating to latest version...");
    const result = await updateApplesauceRepo();
    console.log(result.message);
    if (!result.success) {
      console.log("Note: Continuing despite git error");
    }
  }

  console.log(
    "\nTip: Run 'applesauce-mcp init' to re-ingest the updated content.",
  );
}

export default new Command()
  .description("Update the applesauce repository")
  .option("--tag <tag:string>", "Checkout a specific tag or branch")
  .action(update);
