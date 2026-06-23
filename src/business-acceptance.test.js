import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkConfigSchemas } from "../scripts/check-config-schemas.mjs";
import {
	auditRepository,
	initRepository,
	planRepository,
	runCheck,
	runGenerate,
	runGovernance,
	runPreCommitHook,
} from "./index.js";

function createRepo(prefix) {
	const root = mkdtempSync(join(tmpdir(), prefix));
	writeFileSync(join(root, ".gitignore"), "node_modules\n.env\n");
	return root;
}

test("Business scenario: repository without ownership produces traceable human-debt finding", () => {
	const root = createRepo("stackwarden-business-ownership-");
	try {
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				scripts: { lint: "echo lint", typecheck: "echo typecheck", test: "echo test", build: "echo build" },
			}),
		);
		writeFileSync(join(root, "bun.lock"), "");
		writeFileSync(join(root, ".env.example"), "DATABASE_URL=\n");
		writeFileSync(join(root, "biome.json"), "{}\n");

		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		const finding = report.findings.find((item) => item.id === "SW-HUM-001");

		assert.ok(finding, "expected missing CODEOWNERS finding");
		assert.equal(finding.level, "human");
		assert.equal(finding.domain, "ownership");
		assert.ok(finding.evidence.length > 0, "finding must include evidence");
		assert.match(finding.recommendation, /CODEOWNERS/);
		assert.equal(typeof report.scores.global, "number");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: missing feedback scripts produce deterministic velocity findings", () => {
	const root = createRepo("stackwarden-business-velocity-");
	try {
		writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { lint: "echo lint" } }));
		writeFileSync(join(root, "bun.lock"), "");
		writeFileSync(join(root, ".env.example"), "DATABASE_URL=\n");
		writeFileSync(join(root, "biome.json"), "{}\n");

		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		const findingIds = report.findings.map((item) => item.id).sort();

		assert.ok(findingIds.includes("SW-VEL-TYPECHECK"));
		assert.ok(findingIds.includes("SW-VEL-TEST"));
		assert.ok(findingIds.includes("SW-VEL-BUILD"));
		for (const id of ["SW-VEL-TYPECHECK", "SW-VEL-TEST", "SW-VEL-BUILD"]) {
			const finding = report.findings.find((item) => item.id === id);
			assert.ok(finding, `expected finding ${id}`);
			assert.equal(finding.level, "velocity");
			assert.equal(finding.accessTier, "core");
			assert.equal(finding.visibility, "full");
			assert.equal(finding.implemented, true);
			assert.equal(finding.relevance, true);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: premium capabilities remain masked from core client output", () => {
	const root = createRepo("stackwarden-business-premium-");
	try {
		writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { lint: "echo lint" } }));
		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		for (const finding of report.findings) {
			assert.equal(finding.accessTier, "core");
			assert.equal(finding.visibility, "full");
			assert.equal(finding.implemented, true);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: findings affect the correct methodology levels", () => {
	const root = createRepo("stackwarden-business-levels-");
	try {
		writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { lint: "echo lint" } }));
		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		for (const level of ["material", "brick", "assembly", "human", "velocity", "give"]) {
			assert.equal(typeof report.scores.byLevel[level].score, "number");
		}
		assert.equal(report.findings.find((item) => item.id === "SW-HUM-001")?.level, "human");
		assert.equal(report.findings.find((item) => item.id === "SW-VEL-TEST")?.level, "velocity");
		assert.equal(typeof report.scores.global, "number");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: fast audit is bounded and deep audit can inspect more files", () => {
	const root = createRepo("stackwarden-business-budget-");
	try {
		for (let index = 0; index < 700; index += 1) writeFileSync(join(root, `file-${index}.js`), "export {};\n");
		const fastReport = auditRepository(root, { mode: "fast", json: true, verbose: false });
		const deepReport = auditRepository(root, { mode: "deep", json: true, verbose: false });
		assert.equal(fastReport.metadata.filesVisited, 600);
		assert.ok(deepReport.metadata.filesVisited > fastReport.metadata.filesVisited);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: business-critical domain surface without acceptance tests is detected", () => {
	const root = createRepo("stackwarden-business-missing-tests-");
	try {
		mkdirSync(join(root, "domain"));
		writeFileSync(join(root, "domain", "billing-rules.js"), "export const rule = true;\n");
		const report = auditRepository(root, { mode: "deep", json: true, verbose: false });
		const finding = report.findings.find((item) => item.id === "SW-BIZ-001");
		assert.ok(finding, "expected business testing finding");
		assert.equal(finding.domain, "business-testing");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: missing code-quality tooling creates advisory installation recommendations", () => {
	const root = createRepo("stackwarden-business-tooling-");
	try {
		writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: {}, dependencies: { react: "latest" } }));
		mkdirSync(join(root, "src"));
		mkdirSync(join(root, "migrations"));
		writeFileSync(join(root, "src", "main.tsx"), "export {};\n");
		writeFileSync(join(root, "migrations", "001_init.sql"), "select 1;\n");
		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		for (const id of [
			"SW-TOOL-001",
			"SW-TOOL-002",
			"SW-TOOL-003",
			"SW-TOOL-006",
			"SW-TOOL-007",
			"SW-TOOL-008",
			"SW-TOOL-009",
			"SW-TOOL-010",
			"SW-TOOL-011",
			"SW-TOOL-012",
			"SW-TOOL-013",
			"SW-TOOL-014",
			"SW-TOOL-015",
			"SW-TOOL-016",
			"SW-TOOL-017",
			"SW-TOOL-018",
			"SW-TOOL-019",
			"SW-TOOL-020",
			"SW-TOOL-021",
		]) {
			const finding = report.findings.find((item) => item.id === id);
			assert.ok(finding, `expected tooling finding ${id}`);
			assert.equal(finding.severity, "info");
			assert.equal(finding.fixable, true);
			assert.equal(finding.accessTier, "core");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: brick-level atomic rule gaps are detected without duplicating workspace TypeScript config", () => {
	const root = createRepo("stackwarden-business-brick-rules-");
	try {
		mkdirSync(join(root, "apps", "web", "src"), { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				workspaces: ["apps/*"],
				scripts: { lint: "biome check ." },
			}),
		);
		writeFileSync(join(root, "apps", "web", "src", "index.ts"), "export const ok = true;\n");
		writeFileSync(join(root, "apps", "web", "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
		writeFileSync(join(root, "biome.json"), "{}\n");

		const report = auditRepository(root, { mode: "deep", json: true, verbose: false });
		const findingIds = report.findings.map((item) => item.id);

		assert.equal(findingIds.includes("SW-BRK-003"), false, "workspace tsconfig should satisfy TS config signal");
		assert.equal(findingIds.includes("SW-BRK-004"), true, "format script gap should be detected");
		assert.equal(findingIds.includes("SW-BRK-005"), true, "strictness should be explicit or documented");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: brick-level governance contracts are detected as atomic rule gaps", () => {
	const root = createRepo("stackwarden-business-brick-governance-");
	try {
		mkdirSync(join(root, "docs"));
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				scripts: { lint: "biome check .", typecheck: "tsc --noEmit", test: "node --test" },
			}),
		);
		writeFileSync(join(root, "bun.lock"), "");
		writeFileSync(join(root, ".env.example"), "DATABASE_URL=\n");
		writeFileSync(join(root, "biome.json"), "{}\n");
		writeFileSync(join(root, "AGENTS.md"), "Run bun run test before changes. Never read secrets.\n");
		writeFileSync(join(root, "docs", "generated.md"), "<!-- generated-from: config/source.json -->\n# Generated\n");

		const report = auditRepository(root, { mode: "deep", json: true, verbose: false });
		const findingIds = report.findings.map((item) => item.id);

		assert.equal(findingIds.includes("SW-BRK-GOV-001"), true, "quality contract gap should be detected");
		assert.equal(findingIds.includes("SW-BRK-GOV-003"), true, "projection freshness gap should be detected");
		assert.equal(findingIds.includes("SW-BRK-GOV-004"), true, "non-deterministic AI guardrails should be detected");
		for (const id of ["SW-BRK-GOV-001", "SW-BRK-GOV-003", "SW-BRK-GOV-004"]) {
			const finding = report.findings.find((item) => item.id === id);
			assert.ok(finding, `expected finding ${id}`);
			assert.equal(finding.level, "brick");
			assert.equal(finding.accessTier, "core");
			assert.equal(finding.visibility, "full");
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: declared quality scripts must exist in package scripts", () => {
	const root = createRepo("stackwarden-business-brick-missing-declared-script-");
	try {
		mkdirSync(join(root, ".stackwarden"));
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				scripts: { lint: "biome check ." },
			}),
		);
		writeFileSync(join(root, "bun.lock"), "");
		writeFileSync(join(root, ".env.example"), "DATABASE_URL=\n");
		writeFileSync(join(root, "biome.json"), "{}\n");
		writeFileSync(
			join(root, ".stackwarden", "config.yml"),
			"qualityContract:\n  requiredScripts:\n    - lint\n    - typecheck\n",
		);

		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		const finding = report.findings.find((item) => item.id === "SW-BRK-GOV-002");

		assert.ok(finding, "declared missing script should be detected");
		assert.equal(finding.level, "brick");
		assert.equal(finding.domain, "quality");
		assert.deepEqual(finding.evidence, [".stackwarden/config.yml declares typecheck"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: deterministic governance contracts suppress matching brick-level gaps", () => {
	const root = createRepo("stackwarden-business-brick-governance-configured-");
	try {
		mkdirSync(join(root, ".stackwarden"));
		mkdirSync(join(root, "docs"));
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				scripts: {
					lint: "biome check .",
					typecheck: "tsc --noEmit",
					test: "node --test",
					"docs:check": "node scripts/generate-docs.mjs --check",
				},
			}),
		);
		writeFileSync(join(root, "bun.lock"), "");
		writeFileSync(join(root, ".env.example"), "DATABASE_URL=\n");
		writeFileSync(join(root, "biome.json"), "{}\n");
		writeFileSync(join(root, ".stackwarden", "config.yml"), "qualityContract:\n  requiredScripts:\n    - lint\n");
		writeFileSync(
			join(root, "AGENTS.md"),
			"Run bun run lint and bun run test before changes. Do not read secrets or tokens. No push or publish without approval. Do not delete, overwrite, or change production behavior without approval.\n",
		);
		writeFileSync(join(root, "docs", "generated.md"), "<!-- generated-from: config/source.json -->\n# Generated\n");

		const report = auditRepository(root, { mode: "deep", json: true, verbose: false });
		const findingIds = report.findings.map((item) => item.id);

		assert.equal(findingIds.includes("SW-BRK-GOV-001"), false, "quality contract should suppress gap");
		assert.equal(findingIds.includes("SW-BRK-GOV-003"), false, "freshness script should suppress gap");
		assert.equal(findingIds.includes("SW-BRK-GOV-004"), false, "deterministic AI guardrails should suppress gap");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: Lefthook staged-file commands suppress lint-staged recommendation", () => {
	const root = createRepo("stackwarden-business-lefthook-staged-");
	try {
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				scripts: {},
				devDependencies: {
					lefthook: "latest",
				},
			}),
		);
		writeFileSync(
			join(root, "lefthook.yml"),
			`pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{ts,tsx,js,jsx,json,css}"
      run: bunx biome check --write {staged_files}
      stage_fixed: true
    eslint-security:
      glob: "*.{ts,tsx,js,jsx,mts,cts}"
      run: bunx eslint {staged_files}
`,
		);

		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });

		assert.equal(
			report.findings.some((item) => item.id === "SW-TOOL-003"),
			false,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: configured code-quality tooling suppresses matching installation recommendations", () => {
	const root = createRepo("stackwarden-business-tooling-configured-");
	try {
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				scripts: {
					knip: "knip",
					"security:update-db": "trivy fs .",
					"test:e2e": "playwright test",
					"design:gate": "node scripts/design-gate.js",
					"safety:gate": "node scripts/safety-gate.js",
				},
				devDependencies: {
					"@biomejs/biome": "latest",
					"@commitlint/cli": "latest",
					knip: "latest",
					lefthook: "latest",
					"lint-staged": "latest",
					"eslint-plugin-security": "latest",
				},
				"lint-staged": { "*.js": "biome check" },
			}),
		);
		writeFileSync(join(root, "biome.json"), "{}\n");
		writeFileSync(join(root, "lefthook.yml"), "pre-commit:\n  commands: {}\n");
		writeFileSync(join(root, "renovate.json"), "{}\n");
		writeFileSync(join(root, "playwright.config.ts"), "export default {};\n");
		mkdirSync(join(root, ".github", "rulesets"), { recursive: true });
		mkdirSync(join(root, ".github", "workflows"), { recursive: true });
		writeFileSync(join(root, ".github", "pull_request_template.md"), "## Validation\n");
		writeFileSync(join(root, ".github", "rulesets", "main.json"), "{}\n");
		writeFileSync(join(root, ".github", "workflows", "codeql.yml"), "name: codeql\n");
		writeFileSync(join(root, ".github", "workflows", "scorecard.yml"), "name: scorecard\n");
		writeFileSync(join(root, ".github", "workflows", "release.yml"), "name: release\n");
		writeFileSync(join(root, "lint-baseline.ts"), "export {};\n");
		writeFileSync(join(root, "check-migration-timestamps.sh"), "#!/usr/bin/env bash\n");
		writeFileSync(join(root, "check-no-relative-imports.sh"), "#!/usr/bin/env bash\n");
		writeFileSync(join(root, "check-bundle-budget.sh"), "#!/usr/bin/env bash\n");
		writeFileSync(join(root, "test-unit-failed.sh"), "#!/usr/bin/env bash\n");
		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		for (const id of [
			"SW-TOOL-001",
			"SW-TOOL-002",
			"SW-TOOL-003",
			"SW-TOOL-004",
			"SW-TOOL-005",
			"SW-TOOL-006",
			"SW-TOOL-007",
			"SW-TOOL-008",
			"SW-TOOL-009",
			"SW-TOOL-010",
			"SW-TOOL-011",
			"SW-TOOL-012",
			"SW-TOOL-013",
			"SW-TOOL-014",
			"SW-TOOL-015",
			"SW-TOOL-016",
			"SW-TOOL-017",
			"SW-TOOL-018",
			"SW-TOOL-019",
			"SW-TOOL-020",
			"SW-TOOL-021",
		]) {
			assert.equal(
				report.findings.some((item) => item.id === id),
				false,
				`${id} should be suppressed`,
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: repository social and security contracts are discoverable", () => {
	const root = createRepo("stackwarden-business-doc-contracts-");
	try {
		writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { lint: "echo lint" } }));
		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		for (const id of ["SW-DOC-001", "SW-DOC-002", "SW-DOC-003", "SW-DOC-004"]) {
			const finding = report.findings.find((item) => item.id === id);
			assert.ok(finding, `expected documentation contract finding ${id}`);
			assert.ok(finding.recommendation.length > 0);
		}
		assert.equal(report.findings.find((item) => item.id === "SW-DOC-004")?.level, "material");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: configured repository social and security contracts suppress matching recommendations", () => {
	const root = createRepo("stackwarden-business-doc-contracts-configured-");
	try {
		writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { lint: "echo lint" } }));
		writeFileSync(join(root, "README.md"), "# Fixture\n");
		writeFileSync(join(root, "CONTRIBUTING.md"), "# Contributing\n");
		writeFileSync(join(root, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n");
		writeFileSync(join(root, "SECURITY.md"), "# Security\n");
		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		for (const id of ["SW-DOC-001", "SW-DOC-002", "SW-DOC-003", "SW-DOC-004"]) {
			assert.equal(
				report.findings.some((item) => item.id === id),
				false,
				`${id} should be suppressed`,
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: standardization plan converts audit findings into non-blocking actions", () => {
	const root = createRepo("stackwarden-business-plan-");
	try {
		writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: {} }));
		const plan = planRepository(root, { mode: "deep", json: true, verbose: false });
		assert.equal(plan.tool.name, "stackwarden");
		assert.equal(typeof plan.score, "number");
		assert.equal(plan.metadata.context.profile, "package");
		assert.ok(plan.summary.phases.now >= 0);
		assert.ok(plan.actions.length > 0);
		const action = plan.actions.find((item) => item.findingId === "SW-TOOL-001");
		assert.ok(action, "expected Knip standardization action");
		assert.equal(action.blocking, false);
		assert.equal(action.category, "standardize-tooling");
		assert.ok(["now", "next", "later"].includes(action.phase));
		assert.ok(["low", "medium", "high"].includes(action.priority));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: dependency upgrades are protected by release-age policy recommendation", () => {
	const root = createRepo("stackwarden-business-release-age-");
	try {
		writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { lint: "echo lint" } }));
		writeFileSync(join(root, "bun.lock"), "");
		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		const finding = report.findings.find((item) => item.id === "SW-MAT-004");
		assert.ok(finding, "expected dependency release-age finding");
		assert.equal(finding.severity, "warning");
		assert.equal(finding.fixable, true);
		assert.match(finding.recommendation, /minimum dependency release age/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: configured dependency release-age policy suppresses release-age recommendation", () => {
	const root = createRepo("stackwarden-business-release-age-configured-");
	try {
		mkdirSync(join(root, ".stackwarden"));
		writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { lint: "echo lint" } }));
		writeFileSync(join(root, "bun.lock"), "");
		writeFileSync(join(root, ".stackwarden", "config.yml"), "minimumReleaseAgeDays: 3\n");
		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		assert.equal(
			report.findings.some((item) => item.id === "SW-MAT-004"),
			false,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: duplicate documentation surfaces create 5S cleanup recommendation", () => {
	const root = createRepo("stackwarden-business-5s-");
	try {
		mkdirSync(join(root, "docs", "a"), { recursive: true });
		mkdirSync(join(root, "docs", "b"), { recursive: true });
		writeFileSync(join(root, "docs", "a", "runbook.md"), "A\n");
		writeFileSync(join(root, "docs", "b", "runbook.md"), "B\n");
		const report = auditRepository(root, { mode: "deep", json: true, verbose: false });
		const finding = report.findings.find((item) => item.id === "SW-5S-001");
		assert.ok(finding, "expected 5S finding");
		assert.equal(finding.domain, "lean-5s");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: commit-time continuous improvement loop is recommended and runnable", () => {
	const root = createRepo("stackwarden-business-loop-");
	try {
		writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { lint: "echo lint" } }));
		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		for (const id of ["SW-LOOP-001", "SW-LOOP-002", "SW-LOOP-004", "SW-LOOP-005"]) {
			assert.ok(
				report.findings.some((item) => item.id === id),
				`expected loop recommendation ${id}`,
			);
		}
		const hook = runPreCommitHook(root, { json: true, ci: false, strict: false });
		assert.equal(hook.hook, "pre-commit");
		assert.equal(hook.blocking, false);
		assert.equal(typeof hook.audit.score, "number");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: configured continuous improvement loop suppresses matching recommendations", () => {
	const root = createRepo("stackwarden-business-loop-configured-");
	try {
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				scripts: {
					"stackwarden:pre-commit": "stackwarden hook pre-commit",
					"commit-size": "stackwarden hook pre-commit",
					"env:drift": "stackwarden env drift",
					"docs:governance": "stackwarden docs governance",
				},
			}),
		);
		writeFileSync(
			join(root, "lefthook.yml"),
			"pre-commit:\n  commands:\n    stackwarden:\n      run: stackwarden hook pre-commit\n",
		);
		const report = auditRepository(root, { mode: "fast", json: true, verbose: false });
		for (const id of ["SW-LOOP-001", "SW-LOOP-002", "SW-LOOP-004", "SW-LOOP-005"]) {
			assert.equal(
				report.findings.some((item) => item.id === id),
				false,
				`${id} should be suppressed`,
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: executable env drift check reports key drift without exposing values", () => {
	const root = createRepo("stackwarden-business-env-drift-");
	try {
		writeFileSync(join(root, ".env.example"), "DATABASE_URL=\nPUBLIC_URL=\n");
		writeFileSync(join(root, ".env.local"), "DATABASE_URL=postgres://secret\nEXTRA_TOKEN=secret-value\n");
		const result = runCheck("env-drift", root, { json: true, ci: false, strict: false });
		assert.equal(result.check, "env-drift");
		assert.equal(result.blocking, false);
		assert.equal(result.enforcement, "advisory");
		assert.equal(result.wouldBlockIfStrict, true);
		assert.ok(result.violations.some((violation) => violation.includes(".env.local")));
		assert.equal(JSON.stringify(result).includes("postgres://secret"), false);
		assert.equal(JSON.stringify(result).includes("secret-value"), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: local config decides whether executable checks are blocking", () => {
	const root = createRepo("stackwarden-business-config-blocking-");
	try {
		mkdirSync(join(root, ".stackwarden"));
		writeFileSync(join(root, ".env.example"), "DATABASE_URL=\nPUBLIC_URL=\n");
		writeFileSync(join(root, ".env.local"), "DATABASE_URL=op://vault/item/url\n");
		writeFileSync(
			join(root, ".stackwarden", "config.yml"),
			"continuousImprovement:\n  envDrift:\n    blocking: true\n",
		);
		const configured = runCheck("env-drift", root, { json: true, ci: false, strict: false });
		assert.equal(configured.blocking, true);
		assert.equal(configured.enforcement, "configured");

		writeFileSync(
			join(root, ".stackwarden", "config.yml"),
			"continuousImprovement:\n  envDrift:\n    blocking: false\n",
		);
		const advisory = runCheck("env-drift", root, { json: true, ci: false, strict: false });
		assert.equal(advisory.blocking, false);
		assert.equal(advisory.enforcement, "advisory");
		assert.equal(advisory.wouldBlockIfStrict, true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: executable docs drift check detects generated markdown without marker", () => {
	const root = createRepo("stackwarden-business-docs-drift-");
	try {
		mkdirSync(join(root, "docs", "generated"), { recursive: true });
		writeFileSync(join(root, "docs", "generated", "api.md"), "# API\n");
		const result = runCheck("docs-drift", root, { json: true, ci: false, strict: false });
		assert.equal(result.check, "docs-drift");
		assert.equal(result.blocking, false);
		assert.equal(result.enforcement, "advisory");
		assert.equal(result.wouldBlockIfStrict, true);
		assert.ok(result.violations.some((violation) => violation.includes("docs/generated/api.md")));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: source-of-truth config requires an attached schema", () => {
	const root = createRepo("stackwarden-business-schema-required-");
	try {
		mkdirSync(join(root, "config"));
		mkdirSync(join(root, "schemas"));
		writeFileSync(join(root, "config", "source.json"), JSON.stringify({ schemaVersion: 1, name: "source" }));
		writeFileSync(
			join(root, "schemas", "source.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["$schema", "schemaVersion", "name"],
				properties: { $schema: { type: "string" }, schemaVersion: { const: 1 }, name: { const: "source" } },
			}),
		);
		const violations = checkConfigSchemas({
			root,
			checks: [
				{
					kind: "json",
					file: "config/source.json",
					schema: "schemas/source.schema.json",
					required: ["$schema", "schemaVersion", "name"],
				},
			],
		});
		assert.ok(violations.some((violation) => violation.includes("missing required key $schema")));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: schema drift is compared against the config source", () => {
	const root = createRepo("stackwarden-business-schema-drift-");
	try {
		mkdirSync(join(root, "config"));
		mkdirSync(join(root, "schemas"));
		writeFileSync(
			join(root, "config", "source.json"),
			JSON.stringify({ $schema: "../schemas/source.schema.json", schemaVersion: 1, name: "wrong-source" }),
		);
		writeFileSync(
			join(root, "schemas", "source.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["$schema", "schemaVersion", "name"],
				additionalProperties: false,
				properties: { $schema: { type: "string" }, schemaVersion: { const: 1 }, name: { const: "source" } },
			}),
		);
		const violations = checkConfigSchemas({
			root,
			checks: [
				{
					kind: "json",
					file: "config/source.json",
					schema: "schemas/source.schema.json",
					required: ["$schema", "schemaVersion", "name"],
				},
			],
		});
		assert.ok(violations.some((violation) => violation.includes("config/source.json.name must equal")));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: capabilities and repo config init is dry-run first and never overwrites existing client files", () => {
	const root = createRepo("stackwarden-business-init-");
	try {
		const dryRun = initRepository(root, { write: false, json: true });
		assert.deepEqual(dryRun.changes, [
			{ path: ".stackwarden/capabilities.yml", action: "would-create" },
			{ path: ".stackwarden/config.yml", action: "would-create" },
			{ path: ".stackwarden/lefthook.yml", action: "would-create" },
			{ path: ".stackwarden/hooks/pre-commit", action: "would-create" },
		]);
		assert.equal(existsSync(join(root, ".stackwarden/capabilities.yml")), false);
		assert.equal(existsSync(join(root, ".stackwarden/config.yml")), false);

		const writeRun = initRepository(root, { write: true, json: true });
		assert.deepEqual(writeRun.changes, [
			{ path: ".stackwarden/capabilities.yml", action: "created" },
			{ path: ".stackwarden/config.yml", action: "created" },
			{ path: ".stackwarden/lefthook.yml", action: "created" },
			{ path: ".stackwarden/hooks/pre-commit", action: "created" },
		]);
		assert.equal(existsSync(join(root, ".stackwarden/capabilities.yml")), true);
		assert.equal(existsSync(join(root, ".stackwarden/config.yml")), true);
		assert.equal(existsSync(join(root, ".stackwarden/lefthook.yml")), true);
		assert.equal(existsSync(join(root, ".stackwarden/hooks/pre-commit")), true);

		writeFileSync(join(root, ".stackwarden/capabilities.yml"), "custom: true\n");
		writeFileSync(join(root, ".stackwarden/config.yml"), "custom: true\n");
		const secondWriteRun = initRepository(root, { write: true, json: true });
		assert.deepEqual(secondWriteRun.changes, [
			{ path: ".stackwarden/capabilities.yml", action: "skip-existing" },
			{ path: ".stackwarden/config.yml", action: "skip-existing" },
			{ path: ".stackwarden/lefthook.yml", action: "skip-existing" },
			{ path: ".stackwarden/hooks/pre-commit", action: "skip-existing" },
		]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: agent instructions are generated from StackWarden source of truth", () => {
	const root = createRepo("stackwarden-business-agent-projections-");
	try {
		mkdirSync(join(root, ".stackwarden"));
		writeFileSync(
			join(root, ".stackwarden/agent-rules.yml"),
			`version: 1
name: repo-agent-rules
title: Repository agent playbook
instructions:
  - Run \`bun run test\` before declaring work complete.
  - Do not read secrets or local env files.
validation:
  - bun run test
`,
		);
		writeFileSync(
			join(root, ".stackwarden/agents.yml"),
			`version: 1
name: repo-agents
agents:
  - id: agents-md
    target: AGENTS.md
    enabled: true
  - id: claude
    target: CLAUDE.md
    enabled: true
`,
		);

		const generated = runGenerate("agents", root, { json: true });
		assert.equal(generated.status, "generated");
		assert.equal(existsSync(join(root, "AGENTS.md")), true);
		assert.match(readFileSync(join(root, "AGENTS.md"), "utf8"), /generated-from: \.stackwarden\/agent-rules.yml/);
		assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), /Run `bun run test`/);

		const fresh = runCheck("agents", root, { json: true });
		assert.equal(fresh.status, "passed");

		writeFileSync(join(root, "AGENTS.md"), "manual drift\n");
		const stale = runCheck("agents", root, { json: true, strict: true });
		assert.equal(stale.status, "failed");
		assert.equal(stale.blocking, true);
		assert.ok(stale.violations.some((violation) => violation.includes("AGENTS.md is stale")));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: projection registry validates generated agent documentation edges", () => {
	const root = createRepo("stackwarden-business-projection-registry-");
	try {
		mkdirSync(join(root, ".stackwarden"));
		writeFileSync(join(root, ".stackwarden/agent-rules.yml"), "version: 1\ninstructions:\n  - Keep tests aligned.\n");
		writeFileSync(
			join(root, ".stackwarden/agents.yml"),
			"version: 1\nagents:\n  - id: agents-md\n    target: AGENTS.md\n",
		);
		writeFileSync(
			join(root, ".stackwarden/projections.yml"),
			`version: 1
projections:
  - id: agents
    source: .stackwarden/agent-rules.yml
    additionalSources:
      - .stackwarden/agents.yml
    targets:
      - AGENTS.md
    generator: stackwarden generate agents
    checker: stackwarden check agents
`,
		);
		runGenerate("agents", root, { json: true });

		const projections = runCheck("projections", root, { json: true });
		assert.equal(projections.status, "passed");

		writeFileSync(
			join(root, ".stackwarden/projections.yml"),
			`version: 1
projections:
  - id: agents
    source: .stackwarden/agent-rules.yml
    targets:
      - AGENTS.md
    generator: stackwarden generate agents
`,
		);
		const drift = runCheck("projections", root, { json: true, strict: true });
		assert.equal(drift.status, "failed");
		assert.equal(drift.blocking, true);
		assert.ok(drift.violations.some((violation) => violation.includes("missing checker")));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: governance status aggregates StackWarden-inspired anti-drift checks", () => {
	const root = createRepo("stackwarden-business-governance-status-");
	try {
		mkdirSync(join(root, ".stackwarden"));
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ scripts: { "codeowners:generate": "bun scripts/generate-codeowners.ts" } }),
		);
		mkdirSync(join(root, "scripts"));
		writeFileSync(join(root, "scripts/generate-codeowners.ts"), "console.log('legacy')\n");

		const bypass = runCheck("local-bypass", root, { json: true, strict: true });
		assert.equal(bypass.status, "failed");
		assert.equal(bypass.blocking, true);
		assert.ok(bypass.violations.some((violation) => violation.includes("generate-codeowners.ts")));

		const governance = runCheck("governance", root, { json: true });
		assert.equal(governance.status, "failed");
		assert.ok(governance.checks.some((check) => check.check === "local-bypass"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Business scenario: governance diff reports stale generated agent files without writing", () => {
	const root = createRepo("stackwarden-business-governance-diff-");
	try {
		mkdirSync(join(root, ".stackwarden"));
		writeFileSync(join(root, ".stackwarden/agent-rules.yml"), "version: 1\ninstructions:\n  - Keep tests aligned.\n");
		writeFileSync(
			join(root, ".stackwarden/agents.yml"),
			"version: 1\nagents:\n  - id: agents-md\n    target: AGENTS.md\n",
		);
		runGenerate("agents", root, { json: true });
		writeFileSync(join(root, "AGENTS.md"), "manual drift\n");

		const diff = runGovernance("diff", root, { json: true });
		assert.equal(diff.status, "diff");
		assert.equal(diff.diffs[0].file, "AGENTS.md");
		assert.notEqual(diff.diffs[0].currentHash, diff.diffs[0].expectedHash);
		assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "manual drift\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
