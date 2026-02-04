#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-sys --allow-ffi --allow-run --allow-env
import { Command, EnumType } from "@cliffy/command";
import debugCommand from "./commands/debug.ts";
import rebuildCommand from "./commands/rebuild.ts";
import setupCommand from "./commands/setup.ts";
import updateCommand from "./commands/update.ts";
import { mcpCommand } from "./commands/mcp.ts";
import { CompletionsCommand } from "@cliffy/command/completions";

const mcpModeType = new EnumType(["stdio", "http"]);

await new Command().name("applesauce-mcp")
  // add a custom enum type for the mode
  .type("mcp-mode", mcpModeType).option(
    "--mode <mode:mcp-mode>",
    "Start MCP in SSE mode",
    { default: "stdio" },
  ).option("--port <port:number>", "Port for HTTP server", { default: 3000 })
  .option(
    "--update",
    "Update applesauce repository before starting server",
  )
  .example(
    "Start MCP server in SSE mode on port 8080",
    "applesauce-mcp --mode http --port 8080",
  )
  .example(
    "Start MCP server with auto-update on startup",
    "applesauce-mcp --update",
  )
  .action(
    async ({ mode, port, update }) => {
      await mcpCommand({
        mode,
        port,
        update,
      });
    },
  )
  // Register completions command
  .command("completions", new CompletionsCommand())
  // setup command
  .command(
    "setup",
    setupCommand,
  )
  // update command
  .command(
    "update",
    updateCommand,
  )
  // rebuild command
  .command(
    "rebuild",
    rebuildCommand,
  )
  // debug command
  .command(
    "debug",
    debugCommand,
  ).parse(Deno.args);
