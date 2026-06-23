# StackWarden pre-mortem precision

## Decision sentence

Build StackWarden as a client-facing, open-core npm CLI that observes repository health, evaluates deterministic governance signals, recommends improvements, and lets each team configure what becomes blocking.

## Scope

In scope:

- local `audit`, `plan`, `init`, `hook`, and `check` commands;
- deterministic checks that never need private server logic;
- advisory recommendations by default;
- `.stackwarden/config.yml` as the source for local enforcement choices;
- package-manager-friendly npm distribution;
- client-safe templates under `.stackwarden/`.

Out of scope for the current package:

- automatic mutation outside `.stackwarden/`;
- hidden premium rule execution in the local package;
- claiming a universal maturity standard for every repository;
- replacing human engineering judgment or team governance.

## Operational definitions

| Term | Definition |
| --- | --- |
| Advisory | StackWarden reports evidence and recommendations without failing the command. |
| Blocking | A check can fail the command because the team opted in through config or `--strict`. |
| Finding | A deterministic observation with evidence, level, severity, recommendation, and visibility metadata. |
| Check | A side-effect-free executable inspection command, such as `env-drift` or `docs-drift`. |
| Hook | A local feedback loop that runs fast checks before commit without becoming blocking by default. |
| Open core | Local visible rules that can run safely on client codebases. |
| Premium | Future server/licensed rules whose logic must not be exposed in the client package. |

## Success criteria

- A user can install StackWarden with npm, pnpm, yarn, or bun.
- Install does not mutate the repository.
- `stackwarden init --write` only creates `.stackwarden/` files.
- `stackwarden audit --fast` returns deterministic, explainable recommendations.
- `stackwarden plan` converts findings into non-mutating actions.
- `stackwarden hook pre-commit` gives fast feedback on every commit when explicitly wired.
- `stackwarden check *` commands are advisory unless config or `--strict` makes them blocking.
- Secret values are never printed.
- Business acceptance tests cover the product philosophy and core invariants.

## Non-success examples

- A high score that hides missing security or ownership signals.
- A hook that blocks commits without explicit team consent.
- A recommendation that assumes every repo must adopt the same tooling.
- A check that prints secrets or sensitive values.
- A premium-placeholder finding that leaks rule logic.
- A generated config that overwrites existing client choices.

## Failure definition

StackWarden fails if teams perceive it as noisy, coercive, unsafe, or generic: a tool that nags without enough context, blocks without consent, exposes too much implementation detail, or cannot be trusted in client repositories.

## Evidence map

Facts:

- The package has implemented `audit`, `init`, `plan`, `hook pre-commit`, and executable `check` commands.
- The package has business acceptance tests for advisory behavior, config-controlled blocking, documentation contracts, continuous improvement loops, and safe env drift reporting.
- `.stackwarden/config.yml` already supports local blocking policy for continuous-improvement checks.

Hypotheses:

- Teams want recommendations before enforcement.
- Commit-time advisory feedback improves quality without creating workflow resistance.
- Deterministic checks create more trust than AI-only review.
- Agencies, fractional CTOs, maintainers, and engineering leads will value a repeatable repo maturity lens.

Guesses:

- The six-level scoring model will be intuitive to external users.
- Users will accept `.stackwarden/` as a configuration namespace.
- The initial checks are enough to create perceived value before premium rules exist.

Evidence to collect:

- First-run completion rate: install → audit → plan.
- Number of recommendations users configure as blocking.
- False-positive reports per rule.
- Repeated use across more than one repository by the same user.
- Willingness to pay for premium/server-side maturity checks.

## Pre-mortem: one year later, StackWarden failed

| Failure cause | Precision issue or risk | Mitigation / validation task |
| --- | --- | --- |
| Users felt blocked by a governance tool they did not consent to. | Precision issue: “check failed” was confused with “command blocks”. | Keep advisory default visible in docs, JSON, and tests; require config or `--strict` for blocking. |
| Recommendations were too generic. | Actual risk: low context sensitivity. | Expand repo-context detection and rule applicability before adding many new rules. |
| The CLI looked like an internal methodology dump. | Actual risk: public positioning mismatch. | Keep client-facing language generic; hide internal inspiration details except in JSDoc/internal docs. |
| Premium logic leaked into open core. | Actual risk: open-core boundary failure. | Keep premium findings masked or server-side; test visibility and access tier. |
| Checks printed sensitive data. | Actual risk: security trust failure. | Tests must assert values are never printed; only keys, file paths, and line numbers. |
| Teams ignored findings because plans were not actionable. | Precision issue: “recommendation” lacked next step. | Keep `plan` phase, category, priority, evidence, and source finding. |
| Config became too complex. | Actual risk: adoption friction. | Maintain minimal defaults; add config gradually and document examples. |

## Decision outcome

Accepted with constraints.

Smallest reversible next step:

1. Keep growing executable checks one by one.
2. Keep every check advisory by default.
3. Add config-controlled blocking per check.
4. Add tests before broadening scope.
5. Validate on real repositories before promoting rules as mature.

## Revisit triggers

- A user reports that StackWarden blocked work unexpectedly.
- More than 20% of findings are judged irrelevant in test repositories.
- A check exposes a sensitive value.
- Config cannot express a team’s enforcement policy.
- Premium/local visibility boundaries become ambiguous.
