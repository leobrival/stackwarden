# Business source: stackwarden://business-testing
# Traceability: GitHub #39, #42, #43, #48

Feature: Deterministic codebase governance audit
  StackWarden must transform repository governance intent into executable,
  verifiable, and traceable audit behavior.

  Scenario: Audit a repository with missing ownership
    Given a repository without CODEOWNERS
    When I run stackwarden audit --fast
    Then the report contains finding SW-HUM-001
    And the finding belongs to level human
    And the finding includes evidence and a recommendation
    And the global score remains computable

  Scenario: Audit a repository with missing business-critical feedback scripts
    Given a repository with package.json but without typecheck, test, and build scripts
    When I run stackwarden audit --fast
    Then the report contains velocity findings for missing feedback loops
    And each finding is deterministic and machine-readable

  Scenario: Initialize capabilities and repo configuration without overwriting client files
    Given a repository without .stackwarden/capabilities.yml and .stackwarden/config.yml
    When I run stackwarden init without --write
    Then StackWarden reports dry-run create actions
    When I run stackwarden init with --write
    Then StackWarden creates .stackwarden/capabilities.yml and .stackwarden/config.yml
    When I run stackwarden init with --write again
    Then StackWarden skips the existing files

  Scenario: Premium capabilities remain masked from core client output
    Given a repository using only core capabilities
    When I run stackwarden audit --json
    Then every emitted finding is implemented in the open core
    And every emitted finding is fully visible
    And no premium rule logic is exposed

  Scenario: Findings affect the correct methodology levels
    Given a repository with missing ownership and missing feedback scripts
    When I run stackwarden audit --fast
    Then StackWarden computes a global score
    And StackWarden computes scores for material, brick, assembly, human, velocity, and give
    And ownership findings affect the human level
    And feedback-loop findings affect the velocity level

  Scenario: Fast audit is bounded and deep audit is broader
    Given a repository with more files than the fast budget
    When I run stackwarden audit --fast
    Then StackWarden scans no more than the fast file budget
    When I run stackwarden audit --deep
    Then StackWarden may scan more files than fast mode

  Scenario: Business-critical code has no acceptance test
    Given a repository with a business domain surface but no acceptance test
    When I run stackwarden audit --deep
    Then StackWarden recommends adding business acceptance tests

  Scenario: Repository has 5S cleanup opportunities
    Given a repository with duplicate documentation surfaces
    When I run stackwarden audit --deep
    Then StackWarden reports a 5S cleanup recommendation

  Scenario: Dependency upgrades are protected by release-age policy
    Given a repository with package.json
    And no dependency release-age policy
    When I run stackwarden audit --fast
    Then StackWarden recommends configuring a minimum dependency release age
    And the recommendation is advisory rather than auto-applied

  Scenario: Code quality tooling is recommended when missing
    Given a repository with package.json but no dead-code, hook, staged-lint, dependency-bot, or vulnerability-scan tooling
    When I run stackwarden audit --fast
    Then StackWarden recommends relevant tooling such as Knip, Lefthook, lint-staged, Renovate or Dependabot, Trivy, CodeQL, Scorecard, E2E tests, PR templates, rulesets, and safety/design gates
    And the recommendations are advisory and client-configurable

  Scenario: Standardization plan converts audit findings into actions
    Given a repository with governance and tooling gaps
    When I run stackwarden plan
    Then StackWarden returns non-blocking standardization actions
    And each action references its source finding
    And each action has a category and priority

  Scenario: Repository social and security contracts are discoverable
    Given a repository without README, CONTRIBUTING, CODE_OF_CONDUCT, or SECURITY policy
    When I run stackwarden audit --fast
    Then StackWarden recommends adding repository documentation contracts
    And the security policy recommendation belongs to the material level

  Scenario: Commit-time improvement loop is advisory and deterministic
    Given a repository without a StackWarden pre-commit loop
    When I run stackwarden audit --fast
    Then StackWarden recommends wiring stackwarden hook pre-commit
    When I run stackwarden hook pre-commit
    Then StackWarden runs a fast audit and reports advisory recommendations
    And the hook remains non-blocking unless strict commit-size limits are exceeded

  Scenario: Executable checks provide safe local evidence
    Given a repository with environment, documentation, or commit hygiene drift
    When I run stackwarden check env-drift
    Then StackWarden reports key drift without printing secret values
    When I run stackwarden check docs-drift
    Then StackWarden reports generated documentation without provenance markers
    When I run stackwarden check commit-size
    Then StackWarden reports staged commit size against deterministic thresholds

  Scenario: Configuration sources are constrained by schemas
    Given a StackWarden source-of-truth configuration file
    When the configuration has no $schema reference
    Then the config schema check rejects it
    When the configuration drifts from its declared schema
    Then the config schema check reports the schema drift against the config source
