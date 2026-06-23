<!-- generated-from: packages/stackwarden/config/governance-model.json -->
<!-- Do not edit manually. Run: bun run --filter stackwarden docs:governance-model:generate -->

# StackWarden governance model

This document is generated from `packages/stackwarden/config/governance-model.json`. It defines the client-facing governance vocabulary and deterministic brick-level contracts used by StackWarden.

## Purpose

Expose a client-facing deterministic governance model without leaking internal methodology names, private playbooks, or premium rule logic.

## Principles

- Repository governance must be expressed as explicit, reviewable configuration before it becomes documentation or automation.
- Every durable rule should have a source, owner, validation command, and projection or runtime consumer.
- Human and AI contributors should rely on the same small deterministic commands instead of implicit team memory.
- Generated or derived surfaces must be marked and freshness-checked so drift is visible.
- New rules start advisory until signal quality is proven, then teams may opt into blocking enforcement.

## Governance domains

### Quality contract

ID: `quality-contract`

Client files:
- `package.json`
- `.stackwarden/config.yml`
- `biome.json`
- `eslint.config.js`
- `tsconfig.json`

Checks:
- lint
- format
- typecheck
- test
- build

Brick signals:
- script exists
- config exists
- command is deterministic
- strictness is explicit

### Ownership contract

ID: `ownership-contract`

Client files:
- `CODEOWNERS`
- `.github/CODEOWNERS`
- `.stackwarden/config.yml`

Checks:
- owner coverage
- protected path ownership
- review expectations

Brick signals:
- owner file exists
- protected paths are declared
- review rules are documented

### Documentation contract

ID: `documentation-contract`

Client files:
- `README.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `docs/**`

Checks:
- required docs
- generated markers
- freshness checks
- duplicate surfaces

Brick signals:
- canonical source is clear
- generated docs declare source
- drift check exists

### Projection contract

ID: `projection-contract`

Client files:
- `config/**`
- `schemas/**`
- `docs/**`
- `.stackwarden/config.yml`

Checks:
- schema exists
- source declares schema
- target declares source
- checker compares output

Brick signals:
- source is registered
- schema is attached
- projection has generator and checker

### AI operating contract

ID: `ai-operating-contract`

Client files:
- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/**`
- `.stackwarden/config.yml`

Checks:
- allowed actions
- blocked actions
- validation commands
- source-of-truth instructions

Brick signals:
- no secret access
- no destructive actions without approval
- validation commands are explicit

## Brick-level governance rules

| Rule | Domain | Detects | Recommendation |
| --- | --- | --- | --- |
| `SW-BRK-GOV-001` Governance quality contract is missing | governance | No repository-local declaration of expected quality scripts or checks. | Declare the quality contract in a config-first surface such as .stackwarden/config.yml before adding more automation. |
| `SW-BRK-GOV-002` Quality scripts are declared but missing | quality | A governance config declares checks that package.json does not expose. | Add the missing scripts or update the governance source so humans and agents execute the same commands. |
| `SW-BRK-GOV-003` Generated projection has no freshness check | projections | A generated or derived document is present without an associated checker command. | Register a generator/checker pair so generated surfaces cannot silently drift. |
| `SW-BRK-GOV-004` AI operating rules are not deterministic | ai-guardrails | Agent instructions are missing explicit validation commands or safety boundaries. | Add concise, command-oriented guardrails for validation, source-of-truth updates, secrets, pushes, publication, and destructive edits. |

## Client vocabulary

| Concept | Client-facing term |
| --- | --- |
| Source layer | governance source |
| Projection layer | generated projection |
| Quality layer | quality contract |
| Agent layer | AI operating contract |
| Private methodology policy | Do not expose internal methodology names in client-facing docs, findings, or package output. |
