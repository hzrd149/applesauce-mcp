/**
 * Debug commands for testing TypeScript parsing
 */

import { Command } from "@cliffy/command";
import { join } from "@std/path";
import { APPLESAUCE_LOCAL_PATH } from "../const.ts";
import {
  type ExtractedMethod,
  getAllTypeScriptFiles,
  mapSourceToExportPath,
  parsePackageJson,
  parseTypeScriptFile,
} from "../lib/ts-parser.ts";

/**
 * Get all applesauce package directories
 */
async function getPackageDirectories(): Promise<string[]> {
  const packagesDir = join(APPLESAUCE_LOCAL_PATH, "packages");
  const packages: string[] = [];

  try {
    for await (const entry of Deno.readDir(packagesDir)) {
      if (entry.isDirectory) {
        const packagePath = join(packagesDir, entry.name);
        const packageJsonPath = join(packagePath, "package.json");

        try {
          await Deno.stat(packageJsonPath);
          packages.push(packagePath);
        } catch {
          // Skip directories without package.json
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to read packages directory: ${error}`);
  }

  return packages;
}

/**
 * Parse and display methods from TypeScript files
 */
async function debugMethods(
  options: { package?: string; limit?: number },
): Promise<void> {
  console.log("Parsing TypeScript files...\n");

  let packagesToProcess: string[];

  if (options.package) {
    // Process specific package
    const packageRoot = join(
      APPLESAUCE_LOCAL_PATH,
      "packages",
      options.package,
    );
    try {
      await Deno.stat(packageRoot);
      packagesToProcess = [packageRoot];
    } catch {
      console.error(`Package not found: ${options.package}`);
      console.log("\nAvailable packages:");
      const packages = await getPackageDirectories();
      for (const pkg of packages) {
        console.log(`  - ${pkg.split("/").pop()}`);
      }
      Deno.exit(1);
    }
  } else {
    // Process all packages
    packagesToProcess = await getPackageDirectories();
  }

  const allMethods: Array<
    ExtractedMethod & { packageName: string; importPath: string }
  > = [];

  for (const packageRoot of packagesToProcess) {
    // Parse package.json
    const packageInfo = await parsePackageJson(packageRoot);
    console.log(`Processing: ${packageInfo.name}@${packageInfo.version}`);

    // Get all TypeScript files
    const srcDir = join(packageRoot, "src");
    let tsFiles: string[];

    try {
      tsFiles = await getAllTypeScriptFiles(srcDir);
    } catch (error) {
      console.error(`  ⚠ Failed to read source files: ${error}`);
      continue;
    }

    // Parse all files
    let filesProcessed = 0;
    for (const filePath of tsFiles) {
      try {
        const methods = parseTypeScriptFile(filePath, packageRoot);
        if (methods.length > 0) {
          // Map export paths and create full import paths
          methods.forEach((method) => {
            const exportPath = mapSourceToExportPath(
              filePath,
              packageInfo.exports,
              packageRoot,
            );
            method.exportPath = exportPath;

            const importPath = exportPath
              ? `${packageInfo.name}/${exportPath}`
              : packageInfo.name;

            allMethods.push({
              ...method,
              packageName: packageInfo.name,
              importPath,
            });
          });
          filesProcessed++;
        }
      } catch (error) {
        console.error(`  ⚠ Failed to parse ${filePath}: ${error}`);
      }
    }

    console.log(
      `  Found ${allMethods.length} methods from ${filesProcessed} files\n`,
    );
  }

  // Apply limit
  const limit = options.limit ?? allMethods.length;
  const displayMethods = allMethods.slice(0, limit);

  // Display results
  console.log(`${"=".repeat(80)}`);
  console.log(
    `PARSED METHODS (showing ${displayMethods.length} of ${allMethods.length})`,
  );
  console.log(`${"=".repeat(80)}\n`);

  for (const method of displayMethods) {
    // Method header: KIND: methodName
    console.log(`${method.kind.toUpperCase()}: ${method.methodName}`);

    // Full import path (note if it's a class method)
    if (method.className) {
      console.log(
        `  Class: ${method.className} (method cannot be imported directly)`,
      );
      console.log(`  Import class from: ${method.importPath}`);
    } else {
      console.log(`  Import: ${method.importPath}`);
    }

    // Source location
    console.log(`  Source: ${method.sourceFile}:${method.lineNumber}`);

    // JSDoc documentation
    if (method.jsDoc) {
      console.log(`  ${method.jsDoc}`);
    } else {
      console.log(`  (No documentation available)`);
    }

    console.log(""); // Blank line between methods
  }

  console.log(`\nTotal methods found: ${allMethods.length}`);
  if (displayMethods.length < allMethods.length) {
    console.log(`(Use --limit to see more, showing first ${limit})`);
  }

  // Show summary by kind
  const byKind: Record<string, number> = {};
  for (const method of allMethods) {
    byKind[method.kind] = (byKind[method.kind] ?? 0) + 1;
  }

  console.log("\nBy Kind:");
  for (
    const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])
  ) {
    console.log(`  ${kind.padEnd(12)}: ${count}`);
  }
}

export default new Command()
  .description("Debug commands for testing TypeScript parsing")
  .command("methods", "Parse and display methods from TypeScript files")
  .option("-p, --package <name:string>", "Process specific package only")
  .option(
    "-l, --limit <limit:number>",
    "Maximum number of methods to display",
    { default: 20 },
  )
  .action(debugMethods);
