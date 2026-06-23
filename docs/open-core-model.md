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

### licensed-ruleset

- organization-specific policy packs
- encrypted benchmark rule bundles

### premium-server

- cross-repository benchmark intelligence
- churn-weighted hotspot analysis
- private maturity scoring models

## Local guarantees

- No install-time mutation.
- No writes outside .stackwarden/ from init --write.
- No secret value output.
- No hidden premium rule logic in the published core package.
- No blocking unless configured or strict mode is explicitly requested.

## Configuration files

- `.stackwarden/capabilities.yml` — Declares available local, licensed, and server-side capabilities plus their visibility boundaries.
- `.stackwarden/config.yml` — Controls repository-specific advisory policy, blocking choices, and local preferences.

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
  }
}
```
