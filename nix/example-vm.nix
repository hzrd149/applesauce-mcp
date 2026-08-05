{
  config,
  lib,
  pkgs,
  ...
}:

{
  # This is a complete demonstration VM, not a production server baseline.
  services.applesauce-mcp = {
    enable = true;
    openFirewall = true;
    autoUpdate = true;

    settings = {
      EMBEDDING_PROVIDER = "ollama";
      EMBEDDING_MODEL = "nomic-embed-text:v1.5";
      OLLAMA_HOST = "http://localhost:11434";
    };
  };

  # Ollama for local embeddings in the VM
  services.ollama = {
    enable = true;
    host = "127.0.0.1";
    port = 11434;
    loadModels = [ "nomic-embed-text:v1.5" ];
  };

  # Wait for the configured embedding model before starting initial ingestion.
  systemd.services.applesauce-mcp = {
    requires = [ "ollama-model-loader.service" ];
    after = [ "ollama-model-loader.service" ];
  };

  environment.systemPackages = [ pkgs.curl ];

  # Console credentials for this disposable demonstration VM.
  # Do not copy this plaintext password into a production configuration.
  users.users.applesauce = {
    isNormalUser = true;
    initialPassword = "applesauce";
    extraGroups = [ "wheel" ];
  };
  security.sudo.wheelNeedsPassword = false;

  # `nix run .#vm` forwards the MCP server to 127.0.0.1:3000 on the host.
  virtualisation = {
    graphics = false;
    memorySize = 4096;
    cores = 2;
    # Keep the demonstration disposable instead of creating a qcow2 image.
    diskImage = null;
    forwardPorts = [
      {
        from = "host";
        proto = "tcp";
        host.address = "127.0.0.1";
        host.port = config.services.applesauce-mcp.port;
        guest.port = config.services.applesauce-mcp.port;
      }
    ];
  };

  networking.hostName = "applesauce-mcp-vm";
  system.stateVersion = "25.05";
}
