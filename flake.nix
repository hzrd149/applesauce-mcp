{
  description = "Applesauce MCP - semantic search over Applesauce SDK docs and examples";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    deno2nix.url = "github:hzrd149/deno2nix";
    deno2nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    {
      self,
      nixpkgs,
      deno2nix,
    }:
    let
      systems = [
        "aarch64-linux"
        "x86_64-linux"
      ];

      forAllSystems =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f system (
            import nixpkgs {
              inherit system;
              overlays = [ deno2nix.overlays.default ];
            }
          )
        );

      sourceExclusions = [
        ".git"
        ".planning"
        ".claude"
        "data"
        "flake.nix"
        "flake.lock"
        "nix"
        "node_modules"
        "result"
        "vendor"
      ];

      src = nixpkgs.lib.cleanSourceWith {
        src = ./.;
        filter = path: _type: !(nixpkgs.lib.elem (baseNameOf path) sourceExclusions);
      };
    in
    {
      nixosModules = {
        applesauce-mcp = import ./nix/module.nix self;
        default = self.nixosModules.applesauce-mcp;
      };

      packages = forAllSystems (
        system: pkgs:
        (import ./nix/package.nix {
          inherit pkgs src;
          version = (builtins.fromJSON (builtins.readFile ./deno.json)).version;
        })
        // {
          # `nix run .#vm` — a disposable Applesauce MCP demonstration VM.
          vm =
            (nixpkgs.lib.nixosSystem {
              modules = [
                { nixpkgs.hostPlatform = system; }
                "${nixpkgs}/nixos/modules/virtualisation/qemu-vm.nix"
                self.nixosModules.default
                ./nix/example-vm.nix
              ];
            }).config.system.build.vm;
        }
      );

      apps = forAllSystems (
        system: _pkgs: {
          default = {
            type = "app";
            program = "${self.packages.${system}.default}/bin/applesauce-mcp";
            meta.description = "Run the Applesauce MCP server";
          };
        }
      );

      devShells = forAllSystems (
        _system: pkgs: {
          default = pkgs.mkShell {
            packages = [ pkgs.deno ];

            shellHook = ''
              echo "Applesauce MCP dev shell"
              echo "  deno task dev"
              echo "  deno task cli"
              echo "  nix build .#applesauce-mcp"
            '';
          };
        }
      );

      checks = forAllSystems (
        system: _pkgs: {
          package = self.packages.${system}.default;
          vm = self.packages.${system}.vm;
        }
      );
    };
}
