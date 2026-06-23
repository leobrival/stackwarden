# StackWarden PMF discovery

## PMF candidate

| Field | Value |
| --- | --- |
| ID | SW-PMF-001 |
| Title | Advisory repository governance CLI for codebase maturity |
| Segment | Engineering leads, fractional CTOs, technical founders, agencies, and maintainers who need repeatable repository-quality audits across multiple codebases. |
| Buyer | Founder, CTO, engineering manager, agency owner, or platform lead. |
| Users | Developers, reviewers, maintainers, AI coding agents, and operators responsible for keeping repositories healthy. |
| Painful job | Quickly understand what is missing, risky, inconsistent, or improvable in a repository without hiring a full audit team or imposing a rigid governance framework. |
| Trigger event | A repo is handed to a new team, inherited by an agency, prepared for scale, audited before client delivery, or repeatedly suffering from quality drift. |
| Current alternatives | Manual senior-engineer review, ad hoc checklists, linters only, CI templates, consulting audits, security scanners, or internal governance scripts. |
| Proposed offer | Open-core npm CLI with deterministic local audits, executable checks, standardization plans, and optional future premium/server-side maturity rules. |
| Value promise | Give teams a fast, explainable, non-coercive maturity signal: observe, evaluate, recommend, and let them configure enforcement. |
| Current status | Validating paid demand. |

## Terrifying questions

### 1. Is the problem urgent enough?

Current answer: partially proven.

Strong signals:

- Teams already use linters, CI, hooks, and security tooling because repository drift is painful.
- Multi-repo maintainers need repeatable standards.
- AI-assisted development increases the need for deterministic guardrails.

Weak signals:

- “Governance” can sound like overhead.
- Users may prefer existing tools if StackWarden does not produce better synthesis.
- Urgency may be higher for inherited or client repos than for stable internal repos.

Validation task:

- Run StackWarden on at least five real repositories and record which findings owners consider immediately actionable.

### 2. Is the market narrow enough?

Current answer: needs narrowing.

Possible beachheads:

1. Agencies auditing client repositories before delivery.
2. Fractional CTOs assessing inherited codebases.
3. Technical founders preparing repositories for scale or due diligence.
4. Teams introducing AI coding agents and needing governance loops.

Recommended first ICP:

- Agencies and fractional CTOs who review multiple heterogeneous repositories and need a repeatable, explainable audit artifact.

Validation task:

- Interview 10 people from agencies/fractional CTO profiles and test whether they would use `stackwarden audit` and `stackwarden plan` during onboarding.

### 3. Would users be worse off if this disappeared?

Current answer: not proven.

StackWarden becomes indispensable only if it saves repeated expert time or prevents painful quality drift.

Signals to seek:

- Users run it repeatedly, not only once.
- Users wire `stackwarden hook pre-commit` into their local loop.
- Users configure some checks as blocking.
- Users use plan output to create internal or client backlog items.

Validation task:

- Track whether early users run a second audit within 14 days or add `.stackwarden/config.yml` to a repo.

### 4. Is there paid pull?

Current answer: unproven.

Potential paid behaviors:

- Paying for premium maturity rules.
- Paying for a server-side audit report.
- Paying for multi-repo comparison and standardization.
- Paying for a consulting/productized audit that uses StackWarden as the evidence engine.

Validation task:

- Offer a fixed-price “StackWarden repository maturity audit” to 3 prospects and measure conversion.

### 5. Is delivery repeatable?

Current answer: emerging.

Repeatable assets already present:

- deterministic findings;
- six-level scoring;
- Gherkin scenarios;
- business acceptance tests;
- config-controlled enforcement;
- executable checks;
- generated `.stackwarden/` templates.

Missing repeatability:

- repo-type profiles;
- rule applicability matrix;
- multi-repo standardization;
- false-positive calibration;
- packaged report export.

Validation task:

- Use the same audit flow on 5 repositories and compare how many recommendations remain relevant without manual editing.

### 6. Is it defensible?

Current answer: defensibility must come from method, trust, and accumulated rule quality.

Potential defensibility:

- rule corpus calibrated on real repositories;
- strong advisory-first philosophy;
- open-core trust boundary;
- config-controlled enforcement;
- premium server-side rules for sensitive or advanced analysis;
- benchmarkable maturity profiles.

Weaknesses:

- Individual checks are easy to copy.
- Existing tools cover parts of the same surface.
- Without data from real usage, scoring may look arbitrary.

Validation task:

- Build a rule-quality log: false positives, suppressions, user-enabled blocking, and repeated recommendations accepted by teams.

## PMF evidence gate

Current evidence level: weak to medium.

Existing evidence:

- Internal dogfooding in a real monorepo.
- Cross-repo pattern extraction from multiple real codebases.
- Executable acceptance tests protecting product behavior.
- Growing deterministic check surface.

Missing evidence for emerging fit:

- three independent users with the same painful job;
- at least one paid diagnostic or implementation using StackWarden output;
- repeated use across multiple repositories by the same buyer;
- measurable time saved or risk reduced;
- user-configured enforcement decisions.

Minimum next evidence:

1. Three repository audits with external users.
2. One paid audit or paid pilot.
3. One user wiring `hook pre-commit` or CI usage.
4. One user configuring `blocking: true` for at least one check.
5. Before/after record of repository improvements driven by StackWarden plan.

## Candidate roadmap for validation

Now:

- Keep the CLI advisory-first.
- Add more executable checks only when deterministic and side-effect free.
- Improve README and first-run clarity.
- Run audits on real target repos and collect relevance feedback.

Next:

- Add repo profiles: package, web app, monorepo, open-source, agentic codebase.
- Add report export suitable for client delivery.
- Add suppression/relevance config with reasons.
- Add multi-repo `compare` or `standardize` mode.

Later:

- Add premium/server-side rules.
- Add benchmark datasets and maturity profiles.
- Add hosted history of score evolution.
- Add integration with issue trackers.

## Decision

Do not claim product-market fit yet.

Treat StackWarden as a PMF candidate with promising internal evidence and a clear validation path. The next strategic priority is not more rules in isolation; it is proving that a narrow user segment repeatedly values the audit, acts on the plan, and chooses which recommendations to enforce.
