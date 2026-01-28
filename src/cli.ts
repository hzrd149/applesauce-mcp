#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --allow-ffi
import { Command, EnumType } from "@cliffy/command";
import initCommand from "./commands/init.ts";
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
  .example(
    "Start MCP server in SSE mode on port 8080",
    "applesauce-mcp --mode http --port 8080",
  )
  .action(
    async ({ mode, port }) => {
      console.log("Starting MCP server in", mode);
      await mcpCommand({
        mode,
        port,
      });
    },
  )
  // Register completions command
  .command("completions", new CompletionsCommand())
  // init command
  .command(
    "init",
    initCommand,
  ).parse(Deno.args);
