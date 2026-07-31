# StackWarden monorepo

StackWarden uses the same lightweight monorepo stack as Plugin Factory: Bun Workspaces, TypeScript project configuration, and Biome. Its product boundaries follow the Packmind convention without importing Nx.

## Workspaces

- `packages/stackwarden` — publishable `stackwarden` CLI and reusable governance capabilities.
- `packages/config` — shared TypeScript configuration for current and future workspaces.
- `apps/*` — reserved for independently deployable applications when a real application boundary appears.

The detailed CLI documentation lives in [packages/stackwarden/README.md](packages/stackwarden/README.md).

## Commands

```bash
bun install
bun run check
bun run release:check
```

Run a package command directly with Bun filters:

```bash
bun run --filter stackwarden test
bun run --filter stackwarden check
```

## Architecture principles

- `main` remains the only long-lived branch.
- The repository root orchestrates workspaces, delivery governance, and releases.
- Product code and publishable assets stay inside their owning workspace.
- New workspaces are created only for an independently testable, reusable, or deployable boundary.
- Nx or another task runner should be added only when workspace scale makes Bun filtering insufficient.

See [CONTRIBUTING.md](CONTRIBUTING.md) for delivery conventions and [packages/stackwarden/docs/release-process.md](packages/stackwarden/docs/release-process.md) for releases.
