<!-- generated-from: packages/stackwarden/config/open-core-model.json -->
<!-- Do not edit manually. Run: bun run --filter stackwarden docs:open-core:generate -->

# StackWarden open-core model

This document is generated from `packages/stackwarden/config/open-core-model.json`. The config file is the single source of truth for StackWarden's core, licensed, and premium visibility boundaries.

## Principles

- StackWarden is advisory by default: it observes, evaluates, recommends, and lets teams configure enforcement.
- Install and audit commands must not mutate client repositories.
- Only explicit write commands may create files, and current init output is limited to .stackwarden/.
- Core rules run locally and expose their deterministic logic.
- Premium rules must run server-side, through licensed rulesets, or remain masked so client packages do not expose premium logic.
- Secret values must never be printed in check, audit, hook, report, or plan outputs.
- Blocking behavior is opt-in through .stackwarden/config.yml or an explicit strict flag.
- The public online version must expose product positioning, installation, local core commands, privacy boundaries, and cloud connection points without shipping proprietary rule logic.
- Client repositories must remain autonomous: core governance checks and generators work offline, while cloud features fail open unless explicitly configured as blocking.

## Capability tiers

| Tier | Execution | Visibility | Shipped in core package | Purpose |
| --- | --- | --- | --- | --- |
| core-local | local | full | yes | Deterministic checks and findings implemented in the npm package and safe to inspect locally. |
| licensed-ruleset | local-or-remote | summary | no | Optional licensed rule bundles that may expose summaries while protecting proprietary rule implementation. |
| premium-server | server | masked | no | Advanced analysis whose logic must not be shipped in the open npm package. |

## Tier examples

### core-local

- auditRepository deterministic findings
- stackwarden check commit-size
- stackwarden check env-drift
- stackwarden check docs-drift
- stackwarden plan
- stackwarden check codeowners
- stackwarden check workspaces
- stackwarden check pipeline
- stackwarden generate agents
- stackwarden check projections
- stackwarden check governance

### licensed-ruleset

- organization-specific policy packs
- encrypted benchmark rule bundles

### premium-server

- cross-repository benchmark intelligence
- churn-weighted hotspot analysis
- private maturity scoring models
- agent-governance maturity benchmark
- cross-repository projection drift intelligence
- private recommendation prioritization

## Local guarantees

- No install-time mutation.
- No writes outside .stackwarden/ from init --write.
- No secret value output.
- No hidden premium rule logic in the published core package.
- No blocking unless configured or strict mode is explicitly requested.

## Configuration files

- `.stackwarden/capabilities.yml` — Declares available local, licensed, and server-side capabilities plus their visibility boundaries.
- `.stackwarden/config.yml` — Controls repository-specific advisory policy, blocking choices, and local preferences.
- `.stackwarden/ownership.yml` — Source of truth for generated CODEOWNERS, protected paths, owner groups, and workspace ownership coverage.
- `.stackwarden/workspaces.yml` — Source of truth for package workspace metadata and generated README workspace sections.
- `.stackwarden/pipeline.yml` — Source of truth for affected validation domains, checks, tests, builds, and full-validation triggers.
- `.stackwarden/agents.yml` — Source of truth for enabled coding agents, generated targets, and supported agent artifact surfaces.
- `.stackwarden/agent-rules.yml` — Source of truth for generated AI operating instructions, safety boundaries, and validation commands.
- `.stackwarden/projections.yml` — Source of truth for source-to-target projection edges, generators, checkers, and freshness contracts.

## Public online version

**StackWarden Cloud** status: `planned`.

Provide licensed premium analysis and cross-repository governance intelligence while the public CLI remains useful offline.

### Public website must explain

- open-core split between local core and cloud premium
- install and init do not mutate codebases unless --write is explicit
- core commands work offline
- secret values and source code are not sent by default
- generated projections declare their .stackwarden source

### Public website must not expose

- private methodology names
- customer repository names or data
- premium scoring formulas
- server-side proprietary rule implementations
- tokens, secrets, or private registry URLs

### Initial cloud API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/audit` | Evaluate premium findings from local metadata and core findings. |
| GET | `/v1/license` | Validate token, plan, enabled capabilities, and fail-open policy. |
| GET | `/v1/policy-packs/:id` | Resolve licensed policy-pack metadata without exposing proprietary logic in the public package. |

Default privacy contract:

```json
{
  "sendSourceCode": false,
  "sendSecretValues": false,
  "sendFileNames": true,
  "sendPackageScripts": true,
  "sendStackwardenConfig": true,
  "sendLocalFindings": true
}
```

Failure mode: `fail-open-by-default`.

### Free capabilities

- local audit and plan
- commit-size, env-drift, docs-drift checks
- codeowners/workspaces/pipeline checks and generators
- agent projection generation and drift checks
- projection registry freshness checks
- governance aggregate check

### Paid capabilities

- maturity scoring and benchmark reports
- cross-repository governance drift intelligence
- premium policy packs
- private recommendation prioritization
- team dashboards and historical trend reports
- agent-instruction consistency scoring across multiple repositories

### Public launch checklist

- publish npm package from the public repository
- keep Release Please changelog automation green
- add public CI for tests and secret scanning
- document privacy-first cloud payloads
- add stackwarden audit --cloud fail-open client path
- add license/token setup docs without committing tokens

## JSON visibility contract

```json
{
  "coreFinding": {
    "accessTier": "core",
    "visibility": "full",
    "implemented": true
  },
  "premiumFinding": {
    "accessTier": "premium",
    "visibility": "masked",
    "implemented": false
  },
  "cloudRequest": {
    "sendSourceCode": false,
    "includes": [
      "toolVersion",
      "repository metadata",
      ".stackwarden config summary",
      "local findings",
      "structural signals"
    ],
    "excludes": [
      "secret values",
      "local env values",
      "full source code by default"
    ]
  },
  "cloudResponse": {
    "license": {
      "valid": "boolean",
      "plan": "free|pro|enterprise"
    },
    "findings": "premium findings with masked or summary visibility",
    "recommendations": "prioritized actions safe to display in client repositories"
  }
}
```
