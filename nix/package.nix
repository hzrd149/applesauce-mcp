{
  pkgs,
  src,
  version,
}:
let
  inherit (pkgs) lib;

  applesauce-mcp = pkgs.buildDenoApplication {
    pname = "applesauce-mcp";
    inherit version src;

    entrypoint = "src/cli.ts";
    denoDepsHash = "sha256-fLuy5LriUuwSf6DHUsRORmPg8wG9cZZSktdBBX97G0Q=";
    runtimeInputs = [ pkgs.git ];
    runFlags = [ "-P" ];

    meta = {
      description = "MCP server providing semantic search over Applesauce SDK documentation and code examples";
      homepage = "https://github.com/hzrd149/applesauce-mcp";
      license = lib.licenses.mit;
    };
  };
in
{
  default = applesauce-mcp;
  inherit applesauce-mcp;
  denoDeps = applesauce-mcp.denoDeps;
}
