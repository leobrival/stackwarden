<!-- generated-from: packages/stackwarden/config/business-testing.json -->
<!-- Do not edit manually. Run: bun run --filter stackwarden docs:business-testing:generate -->

# StackWarden business testing

Source methodology: `stackwarden://business-testing`.

Transform StackWarden business intent into executable, verifiable, and traceable tests for CLI, rule, configuration, hook, and check behavior.

## Principles

- GitHub issues carry business intent and traceability.
- Gherkin is a shared business language, not a UI or API script.
- Business-unit tests prove domain rules in isolation.
- Acceptance tests prove critical system behavior.
- Config files with source-of-truth status must declare a schema and pass schema drift checks.

## Traceability

| Business intent | Feature | Executable test |
| --- | --- | --- |
| #39 governance CLI | `features/governance-audit.feature` | src/business-acceptance.test.js |
| #42 stable JSON findings | `features/governance-audit.feature` | velocity finding assertions |
| #43 deterministic rule catalog | `features/governance-audit.feature` | ownership and feedback-loop assertions |
| #48 fixtures and dogfooding | `features/governance-audit.feature` | temporary repository fixtures |
| #60 generated open-core model | `features/governance-audit.feature` | docs:open-core:check and premium masking assertions |

## Rules

- Gherkin describes business behavior, not implementation details.
- Acceptance tests assert deterministic outputs: finding ids, levels, evidence, recommendations, capabilities visibility, and config-controlled blocking.
- Client-safe behavior is tested as a business invariant: init is dry-run first, writes only under .stackwarden/ with --write, and skips existing files.
- Open-core behavior is tested: emitted core findings are implemented and fully visible; premium logic is not exposed.
- Executable checks are tested as advisory by default, with blocking controlled by config or explicit strict mode.
- Config source-of-truth files are invalid unless a schema is attached and the schema-required fields match the config.
- Lean/5S and business-testing signals are tested in deep mode because they require broader repository context.
