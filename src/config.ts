import { type Config } from "./types.ts";
import { resolve } from "@std/path";

const DEFAULT_CONFIG_PATH = "./config.json";

/**
 * Load configuration from config.json
 */
export async function loadConfig(
  configPath: string = DEFAULT_CONFIG_PATH,
): Promise<Config> {
  try {
    const configData = await Deno.readTextFile(configPath);
    const config = JSON.parse(configData) as Config;

    // Validate required fields
    if (!config.examplesFolder) {
      throw new Error("Config missing required field: examplesFolder");
    }

    // Resolve the examples folder path to absolute
    config.examplesFolder = resolve(Deno.cwd(), config.examplesFolder);

    return config;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(
        `Config file not found at ${configPath}. Please create a config.json file with an "examplesFolder" field.`,
      );
    }
    throw error;
  }
}

/**
 * Create a default config file
 */
export async function createDefaultConfig(
  configPath: string = DEFAULT_CONFIG_PATH,
): Promise<void> {
  const defaultConfig: Config = {
    examplesFolder: "./examples",
  };

  await Deno.writeTextFile(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log(`Created default config file at ${configPath}`);
}
