self:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.applesauce-mcp;
in
{
  options.services.applesauce-mcp = {
    enable = lib.mkEnableOption "Applesauce MCP server";

    package = lib.mkPackageOption self.packages.${pkgs.stdenv.hostPlatform.system} "applesauce-mcp" { };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Whether to open the configured Applesauce MCP TCP port in the firewall.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/run/secrets/applesauce-mcp.env";
      description = ''
        Environment file containing additional configuration or secrets
        (e.g. OPENAI_API_KEY). Do not put secrets directly in settings
        because the generated environment enters the world-readable Nix
        store.
      '';
    };

    settings = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      example = {
        EMBEDDING_PROVIDER = "ollama";
        EMBEDDING_MODEL = "nomic-embed-text:v1.5";
        OLLAMA_HOST = "http://localhost:11434";
      };
      description = ''
        Environment variables passed to the MCP server. Secret values
        should be supplied through environmentFile because these values
        enter the world-readable Nix store.
      '';
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "TCP port for the MCP HTTP server.";
    };

    autoUpdate = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to update the applesauce repository on startup.";
    };
  };

  config = lib.mkIf cfg.enable {
    services.applesauce-mcp.settings = {
      APPLESAUCE_REPO_PATH = lib.mkDefault "/var/lib/applesauce-mcp/applesauce";
      APPLESAUCE_DB_PATH = lib.mkDefault "/var/lib/applesauce-mcp";
    };

    networking.firewall.allowedTCPPorts = lib.optional cfg.openFirewall cfg.port;

    systemd.services.applesauce-mcp = {
      description = "Applesauce MCP server";
      documentation = [ "https://github.com/hzrd149/applesauce-mcp" ];
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];

      environment = cfg.settings // {
        DENO_DIR = "/var/cache/applesauce-mcp/deno";
      };
      restartTriggers = [ cfg.environmentFile ];

      serviceConfig = {
        ExecStart = "${lib.getExe cfg.package} --mode http --port ${toString cfg.port}${lib.optionalString cfg.autoUpdate " --update"}";
        Restart = "on-failure";
        RestartSec = 5;

        DynamicUser = true;
        StateDirectory = "applesauce-mcp";
        CacheDirectory = "applesauce-mcp";
        WorkingDirectory = "/var/lib/applesauce-mcp";
        UMask = "0077";

        NoNewPrivileges = true;
        PrivateDevices = true;
        PrivateTmp = true;
        ProtectControlGroups = true;
        ProtectHome = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        ProtectSystem = "strict";
        RestrictSUIDSGID = true;
      }
      // lib.optionalAttrs (cfg.environmentFile != null) {
        EnvironmentFile = cfg.environmentFile;
      };
    };
  };
}
