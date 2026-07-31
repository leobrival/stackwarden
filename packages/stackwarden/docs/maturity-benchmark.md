# StackWarden maturity benchmark

StackWarden turns mature repository practices into deterministic, client-safe audit signals.

## Maturity principles

1. Prefer explicit repository contracts: README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CODEOWNERS, PR templates.
2. Separate advisory from blocking gates.
3. Make supply-chain risk visible early: lockfiles, release-age policy, dependency bots, CodeQL, Scorecard, Trivy.
4. Detect context before recommending: app, package, monorepo, UI, migrations, automation.
5. Convert audit findings into non-mutating Now/Next/Later plans.
6. Preserve traceability from business intent to Gherkin scenarios and executable tests.

## Current implementation

- `audit` returns deterministic findings and repository context.
- `plan` runs a deep audit and groups actions by category, priority, and phase.
- Business acceptance tests validate critical behavior.

## Current benchmark dimensions

- Repository contracts and ownership.
- Deterministic local feedback loops.
- Brick-level atomic rule posture: lint contracts, formatter entrypoints, TypeScript config coverage, and explicit strictness.
- Supply-chain and security posture.
- Business-critical acceptance coverage.
- Context-aware recommendations.
- Non-mutating standardization plans.

## Future premium/server candidates

- Churn-weighted hotspots.
- CODEOWNERS coverage quality.
- Circular dependency graph.
- PR size and review latency analysis.
- API compatibility and migration safety.
- Fuzzing and SBOM provenance checks.
