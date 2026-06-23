# StackWarden

Terminal-first codebase governance and health CLI.

## Philosophy

StackWarden is advisory by default. It does not force a repository to follow a single operating model.

Its loop is:

1. **Observe** — inspect repository structure, scripts, hooks, documentation, supply-chain signals, and local evidence.
2. **Evaluate** — classify what looks healthy, risky, missing, inconsistent, or improvable.
3. **Recommend** — explain the finding, evidence, likely improvement, and suggested next action.
4. **Let teams configure** — keep enforcement opt-in through local config, hook wiring, or explicit `--strict` mode.

A failed check means “StackWarden found evidence worth acting on”, not “your commit or CI must fail”. Commands remain non-blocking unless the team explicitly asks for strict enforcement or configures a check as blocking.

Blocking is a configuration choice, not the default product posture.

## Usage

```bash
npx stackwarden audit --fast
npx stackwarden audit --deep --json
npx stackwarden init --write
npx stackwarden plan --json
npx stackwarden hook pre-commit
npx stackwarden check env-drift --json
npx stackwarden check docs-drift --json
npx stackwarden check commit-size --json
npx stackwarden check codeowners --json
npx stackwarden check workspaces --json
npx stackwarden generate codeowners
npx stackwarden generate workspaces
npx stackwarden affected verify --base origin/main --dry-run
npx stackwarden generate agents
npx stackwarden check agents
npx stackwarden check projections
npx stackwarden check governance
npx stackwarden check local-bypass
npx stackwarden governance status
npx stackwarden governance diff
```

## Executable checks

StackWarden includes side-effect-free local checks. They observe, evaluate, and recommend by default. Add `--strict`, or configure a check as blocking in `.stackwarden/config.yml`, only when a team explicitly wants a check to fail the command.

- `stackwarden check commit-size` — staged commit size guard.
- `stackwarden check env-drift` — compares `.env.example` keys with local env files without printing values.
- `stackwarden check docs-drift` — detects generated documentation without provenance markers and duplicate Markdown surfaces.
- `stackwarden check codeowners` / `stackwarden generate codeowners` — keeps `.github/CODEOWNERS` generated from `.stackwarden/ownership.yml`.
- `stackwarden check workspaces` / `stackwarden generate workspaces` — keeps root and workspace README projections generated from `.stackwarden/workspaces.yml`.
- `stackwarden check pipeline` / `stackwarden affected verify` — validates `.stackwarden/pipeline.yml` and runs or previews affected checks/tests/builds.
- `stackwarden generate agents` / `stackwarden check agents` — keeps agent instructions generated from `.stackwarden/agent-rules.yml` and `.stackwarden/agents.yml`.
- `stackwarden check projections` — validates `.stackwarden/projections.yml` source/target/generator/checker edges.
- `stackwarden check governance` — aggregate governance freshness check for projections, agents, ownership, workspaces, pipeline, and local bypasses.
- `stackwarden check local-bypass` — detects copied repo-local governance scripts that should be replaced by StackWarden commands.
- `stackwarden governance status` — StackWarden-inspired status view for all governance drift checks.
- `stackwarden governance diff` — StackWarden-inspired preview of generated projection differences without writing files.

## Commit-time feedback loop

`stackwarden hook pre-commit` runs a fast local audit plus a deterministic commit-size guard. It is advisory by default, so teams get continuous improvement recommendations on every commit without turning StackWarden into a surprise blocker.

`stackwarden init --write` creates optional hook templates under `.stackwarden/` only. Wire `.stackwarden/lefthook.yml` or `.stackwarden/hooks/pre-commit` into your local hook manager when you want automatic commit-time feedback.

## Package managers

Public npm package target:

```bash
npm install -g stackwarden
pnpm add -g stackwarden
yarn global add stackwarden
bun add -g stackwarden

npx stackwarden audit --fast
pnpm dlx stackwarden audit --fast
yarn dlx stackwarden audit --fast
bunx stackwarden audit --fast
```

The installed binary remains `stackwarden`.

## Standardization plan

`stackwarden plan` runs a deep audit and converts findings into a non-mutating standardization plan: tooling to add, supply-chain risk to reduce, governance gaps, business tests, and 5S cleanup opportunities.

## Product validation notes

- [Pre-mortem precision](./docs/pre-mortem-precision.md) defines the failure modes, success criteria, and constraints for StackWarden as a product decision.
- [PMF discovery](./docs/pmf-discovery.md) defines the current market hypothesis, evidence gaps, and validation plan.

## Generated governance docs

The [open-core model](./docs/open-core-model.md) is generated from `config/open-core-model.json`, which is the single source of truth for local core, licensed, and premium/server-side boundaries.

The [governance model](./docs/governance-model.md) is generated from `config/governance-model.json`, which defines the client-facing governance vocabulary, quality contracts, projection contracts, and AI operating contracts without exposing private methodology names.

Every StackWarden config source should declare a `$schema` and pass the schema freshness check. Generated documentation is registered in `config/projections.json`, so the systematic workflow is always:

```txt
schema-constrained config source → generated projection → freshness check
```

```bash
bun run docs:generate
bun run docs:check
bun run projections:check
bun run config:schema:check
```

## Client-facing config

`npm install -g stackwarden` only installs the CLI. It does not mutate a client codebase.

`stackwarden init --write` creates a `.stackwarden/` directory with:

- `.stackwarden/capabilities.yml` — available local capabilities, licensed capabilities, and visibility boundaries.
- `.stackwarden/config.yml` — repository-specific advisory configuration.

Recommended config is non-blocking by default. For example, the first material/iceberg layer exposes dependency update policy so each repository can tune whether dependency upgrades are recommended, security-only, patch/minor/major, or require human review.

Checks can also be promoted from advisory to blocking in `.stackwarden/config.yml`:

```yaml
continuousImprovement:
  commitSize:
    blocking: false
  envDrift:
    blocking: true
  documentationDrift:
    blocking: false
```

With this configuration, `stackwarden check env-drift` can fail when drift is detected, while commit-size and documentation drift remain advisory. The same behavior can be forced temporarily with `--strict`.

It also recommends a dependency release-age policy, e.g. delaying upgrades to versions published less than 3 days ago, to reduce exposure to fresh supply-chain and exfiltration attacks. Whether that recommendation becomes blocking is a team configuration decision.
