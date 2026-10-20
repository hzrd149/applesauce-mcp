# Changelog

All notable changes to this project will be documented in this file.

## 0.5.3 - 2026-10-20

- Update all dependencies (LanceDB 0.40, MCP SDK 1.32, TypeScript 6, Zod 4,
  Cliffy 1.3, LangChain updates).
- Fix MCP SDK type resolution so tool and transport types are checked again.
- Fix example indexing for applesauce v7 examples that import before their JSDoc
  header, and skip examples without a description instead of aborting rebuilds.
- Update the Nix `denoDepsHash` for the new lockfile.

## 0.5.1 - 2026-03-25

- Remove MCP resource exposure so the server now exposes MCP tools only.
- Clean up related tool wording and documentation formatting.
