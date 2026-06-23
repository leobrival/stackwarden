#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "0.1.4";
const LEVELS = [
	{
		id: "material",
		label: "L1 Material / Iceberg",
		description: "Hidden foundations: dependencies, supply chain, secrets, lockfiles, runtime config.",
	},
	{
		id: "brick",
		label: "L2 Brick / Atomic Rules",
		description: "Small deterministic rules: lint, formatting, conventions, invariants.",
	},
	{
		id: "assembly",
		label: "L3 Assembly / Spaghetti",
		description: "Architecture health: hotspots, structure, generated clutter, coupling signals.",
	},
	{
		id: "human",
		label: "L4 Human Debt",
		description: "Ownership, bus factor, agent instructions, team operating clarity.",
	},
	{
		id: "velocity",
		label: "L5 Velocity",
		description: "Feedback loops: scripts, CI, fast checks, delivery friction.",
	},
	{
		id: "give",
		label: "L6 Give / Team Action",
		description: "One concrete action that helps the team now without hiding system risk.",
	},
];

const DEFAULT_EXCLUDES = new Set([
	".git",
	"node_modules",
	".next",
	"dist",
	"build",
	"coverage",
	".turbo",
	".cache",
	".mastra",
	"storybook-static",
]);

const color = {
	green: (value) => paint(value, "\u001b[32m"),
	yellow: (value) => paint(value, "\u001b[33m"),
	red: (value) => paint(value, "\u001b[31m"),
	cyan: (value) => paint(value, "\u001b[36m"),
	bold: (value) => paint(value, "\u001b[1m"),
	dim: (value) => paint(value, "\u001b[2m"),
};

function paint(value, code) {
	if (!process.stdout.isTTY || process.env.NO_COLOR) return value;
	return `${code}${value}\u001b[0m`;
}

/** @typedef {"info" | "warning" | "error"} Severity */
/** @typedef {"material" | "brick" | "assembly" | "human" | "velocity" | "give"} LevelId */

/**
 * @typedef {object} Finding
 * @property {string} id
 * @property {string} title
 * @property {Severity} severity
 * @property {LevelId} level
 * @property {string} domain
 * @property {string} message
 * @property {string[]} evidence
 * @property {string} recommendation
 * @property {boolean} fixable
 * @property {"low" | "medium" | "high"} confidence
 * @property {"core" | "premium" | "server" | "licensed"} accessTier
 * @property {"full" | "summary" | "score_only" | "masked"} visibility
 * @property {boolean} implemented
 * @property {boolean} relevance
 */

/**
 * @typedef {object} AuditOptions
 * @property {"fast" | "deep"} mode
 * @property {boolean} json
 * @property {boolean} verbose
 */

function main(argv = process.argv.slice(2)) {
	const { command, path, checkName, options } = parseArgs(argv);
	if (options.help || command === "help") {
		printHelp();
		return;
	}
	if (options.version) {
		console.log(VERSION);
		return;
	}
	if (command === "audit") {
		const report = auditRepository(path, options);
		if (options.json) console.log(JSON.stringify(report, null, 2));
		else printAuditReport(report);
		process.exitCode = report.summary.errors > 0 && options.ci ? 1 : 0;
		return;
	}
	if (command === "init") {
		const result = initRepository(path, options);
		if (options.json) console.log(JSON.stringify(result, null, 2));
		else printInitResult(result);
		return;
	}
	if (command === "plan") {
		const plan = planRepository(path, options);
		if (options.json) console.log(JSON.stringify(plan, null, 2));
		else printPlan(plan);
		return;
	}
	if (command === "hook" && path === "pre-commit") {
		const result = runPreCommitHook(".", options);
		if (options.json) console.log(JSON.stringify(result, null, 2));
		else printHookResult(result);
		process.exitCode = result.blocking && options.ci ? 1 : 0;
		return;
	}
	if (command === "check") {
		const result = runCheck(checkName ?? path, checkName ? path : ".", options);
		if (options.json) console.log(JSON.stringify(result, null, 2));
		else printCheckResult(result);
		process.exitCode = result.blocking ? 1 : 0;
		return;
	}
	console.error(`Unknown command: ${command ?? "<none>"}`);
	printHelp();
	process.exitCode = 1;
}

function parseArgs(argv) {
	/** @type {AuditOptions & { write: boolean, help: boolean, version: boolean, ci: boolean, strict: boolean }} */
	const options = {
		mode: "fast",
		json: false,
		verbose: false,
		write: false,
		help: false,
		version: false,
		ci: false,
		strict: false,
	};
	let command;
	let checkName;
	let path = ".";
	for (const arg of argv) {
		if (arg === "--fast") options.mode = "fast";
		else if (arg === "--deep") options.mode = "deep";
		else if (arg === "--json") options.json = true;
		else if (arg === "--verbose") options.verbose = true;
		else if (arg === "--write") options.write = true;
		else if (arg === "--ci") options.ci = true;
		else if (arg === "--strict") options.strict = true;
		else if (arg === "--help" || arg === "-h") options.help = true;
		else if (arg === "--version" || arg === "-v") options.version = true;
		else if (!command) command = arg;
		else if (command === "check" && !checkName) checkName = arg;
		else path = arg;
	}
	return { command: command ?? "help", path, checkName, options };
}

function printHelp() {
	console.log(
		`StackWarden ${VERSION}\n\nUsage:\n  stackwarden audit [path] [--fast|--deep] [--json] [--ci]\n  stackwarden init [path] [--write] [--json]\n  stackwarden plan [path] [--json]\n  stackwarden hook pre-commit [--json] [--ci]\n  stackwarden check <commit-size|env-drift|docs-drift> [--json] [--strict]\n\nExamples:
  stackwarden audit --fast\n  stackwarden audit . --deep --json\n  stackwarden init /tmp/repo --write\n  stackwarden plan .\n  stackwarden hook pre-commit\n  stackwarden check env-drift --json
  stackwarden check env-drift /tmp/repo --json`,
	);
}

/**
 * @param {string} targetPath
 * @param {AuditOptions} options
 */
export function auditRepository(targetPath = ".", options = { mode: "fast", json: false, verbose: false }) {
	const root = resolve(targetPath);
	const startedAt = Date.now();
	const snapshot = scanRepository(root, options);
	/** @type {Finding[]} */
	const findings = [
		...checkMaterial(snapshot),
		...checkBrick(snapshot),
		...checkAssembly(snapshot),
		...checkHuman(snapshot),
		...checkDocumentation(snapshot),
		...checkVelocity(snapshot),
		...checkTooling(snapshot),
		...checkContinuousImprovement(snapshot),
		...checkBusinessTesting(snapshot),
		...checkLean5S(snapshot),
	];
	findings.push(makeGiveFinding(findings));
	const scores = scoreFindings(findings);
	const context = detectRepoContext(snapshot);
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		metadata: {
			repositoryPath: root,
			repositoryName: basename(root),
			mode: options.mode,
			durationMs: Date.now() - startedAt,
			filesVisited: snapshot.filesVisited,
			filesRead: snapshot.filesRead,
			context,
		},
		levels: LEVELS,
		scores,
		summary: summarize(findings),
		findings,
		recommendations: topRecommendations(findings),
	};
}

function scanRepository(root, options) {
	const packageJson = readJsonIfExists(join(root, "package.json"));
	const files = listFiles(root, options.mode === "deep" ? 3000 : 600);
	const fileSet = new Set(files.map((file) => normalizePath(file)));
	const stackwardenConfigText = readTextIfExists(join(root, ".stackwarden/config.yml"));
	const rootTsconfigText = readTextIfExists(join(root, "tsconfig.json"));
	const agentInstructionText = [
		stackwardenConfigText,
		readTextIfExists(join(root, "AGENTS.md")),
		readTextIfExists(join(root, "CLAUDE.md")),
		...files
			.filter((file) => normalizePath(file).startsWith(".cursor/rules/"))
			.map((file) => readTextIfExists(join(root, file))),
	]
		.filter(Boolean)
		.join("\n");
	const hookConfigText = [
		readTextIfExists(join(root, "lefthook.yml")),
		readTextIfExists(join(root, ".stackwarden/lefthook.yml")),
		readTextIfExists(join(root, ".husky/pre-commit")),
		readTextIfExists(join(root, ".git/hooks/pre-commit")),
	]
		.filter(Boolean)
		.join("\n");
	return {
		root,
		mode: options.mode,
		packageJson,
		stackwardenConfigText,
		rootTsconfigText,
		agentInstructionText,
		hookConfigText,
		files,
		fileSet,
		filesVisited: files.length,
		filesRead: packageJson ? 1 + (stackwardenConfigText ? 1 : 0) : stackwardenConfigText ? 1 : 0,
		has: (relativePath) => existsSync(join(root, relativePath)),
		matches: (predicate) => files.some((file) => predicate(normalizePath(file))),
	};
}

function listFiles(root, maxFiles) {
	/** @type {string[]} */
	const results = [];
	/** @param {string} directory */
	function walk(directory) {
		if (results.length >= maxFiles) return;
		let entries = [];
		try {
			entries = readdirSync(directory, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (results.length >= maxFiles) return;
			if (DEFAULT_EXCLUDES.has(entry.name)) continue;
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) walk(absolute);
			else if (entry.isFile()) results.push(absolute.slice(root.length + 1));
		}
	}
	walk(root);
	return results;
}

function readJsonIfExists(path) {
	if (!existsSync(path)) return undefined;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

function readTextIfExists(path) {
	if (!existsSync(path)) return undefined;
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function normalizePath(path) {
	return path.split("\\").join("/");
}

function checkMaterial(snapshot) {
	/** @type {Finding[]} */
	const findings = [];
	const hasPackage = Boolean(snapshot.packageJson);
	const hasLockfile = ["bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].some((file) =>
		snapshot.has(file),
	);
	if (hasPackage && !hasLockfile) {
		findings.push(
			finding(
				"SW-MAT-001",
				"warning",
				"material",
				"supply-chain",
				"Package manifest has no lockfile",
				["package.json found", "no known lockfile found"],
				"Commit exactly one package-manager lockfile to reduce dependency drift.",
				true,
			),
		);
	}
	if (!snapshot.has(".env.example") && !snapshot.matches((file) => file.endsWith("/.env.example"))) {
		findings.push(
			finding(
				"SW-MAT-002",
				"warning",
				"material",
				"configuration",
				"No .env.example detected",
				["searched repository root and scanned files"],
				"Add a secrets-free .env.example to document required runtime configuration.",
				true,
			),
		);
	}
	if (!snapshot.has(".gitignore")) {
		findings.push(
			finding(
				"SW-MAT-003",
				"error",
				"material",
				"hygiene",
				"No .gitignore detected",
				[".gitignore missing"],
				"Add a .gitignore covering dependencies, build outputs, env files, and local caches.",
				true,
			),
		);
	}
	if (hasPackage && !hasDependencyReleaseAgePolicy(snapshot)) {
		findings.push(
			finding(
				"SW-MAT-004",
				"warning",
				"material",
				"supply-chain",
				"No dependency release-age policy detected",
				["package.json found", "no minimum dependency release-age policy found"],
				"Configure a minimum dependency release age before upgrades, for example 3 days, to reduce exposure to fresh supply-chain and exfiltration attacks.",
				true,
			),
		);
	}
	return findings;
}

function hasDependencyReleaseAgePolicy(snapshot) {
	const packageText = JSON.stringify(snapshot.packageJson ?? {});
	const configText = snapshot.stackwardenConfigText ?? "";
	return /minimumReleaseAge|minimumReleaseAgeDays|minimumDependencyReleaseAgeDays/.test(
		`${packageText}\n${configText}`,
	);
}

function checkBrick(snapshot) {
	const scripts = snapshot.packageJson?.scripts ?? {};
	const declaredQualityScripts = getDeclaredQualityScripts(snapshot.stackwardenConfigText);
	/** @type {Finding[]} */
	const findings = [];
	if (!scripts.lint)
		findings.push(
			finding(
				"SW-BRK-001",
				"warning",
				"brick",
				"quality",
				"No lint script detected",
				["package.json scripts.lint missing"],
				"Add a deterministic lint script so one atomic style rule can be enforced locally and in CI.",
				true,
			),
		);
	if (!snapshot.has("biome.json") && !snapshot.has("eslint.config.js") && !snapshot.has(".eslintrc.json")) {
		findings.push(
			finding(
				"SW-BRK-002",
				"warning",
				"brick",
				"quality",
				"No lint configuration detected",
				["no biome.json, eslint.config.js, or .eslintrc.json"],
				"Add Biome or ESLint configuration to make code rules explicit.",
				true,
			),
		);
	}
	if (hasTypeScriptFiles(snapshot) && !hasAnyTsconfig(snapshot)) {
		findings.push(
			finding(
				"SW-BRK-003",
				"warning",
				"brick",
				"typescript",
				"TypeScript files exist without tsconfig",
				["*.ts or *.tsx detected", "no root or workspace tsconfig detected"],
				"Add a root tsconfig or explicit workspace tsconfigs for deterministic type checking.",
				true,
			),
		);
	}
	if (hasCodeFiles(snapshot) && !hasFormatterScript(scripts)) {
		findings.push(
			finding(
				"SW-BRK-004",
				"info",
				"brick",
				"formatting",
				"No formatter script detected",
				["code-like files detected", "no format/prettier/biome format script detected"],
				"Add a deterministic formatter script so one-command formatting is available locally, in hooks, and in CI.",
				true,
			),
		);
	}
	if (hasTypeScriptFiles(snapshot) && hasAnyTsconfig(snapshot) && !tsconfigEnablesStrict(snapshot.rootTsconfigText)) {
		findings.push(
			finding(
				"SW-BRK-005",
				"info",
				"brick",
				"typescript",
				"TypeScript strict mode is not explicit at the root",
				["TypeScript files and tsconfig detected", "root compilerOptions.strict: true not detected"],
				"Enable strict mode in the root tsconfig, or document why strictness is delegated to workspace configs.",
				true,
			),
		);
	}
	if (snapshot.packageJson && !hasRepositoryQualityContract(snapshot)) {
		findings.push(
			finding(
				"SW-BRK-GOV-001",
				"info",
				"brick",
				"governance",
				"Repository quality contract is not explicit",
				["package.json found", "no local quality contract source detected"],
				"Declare expected validation scripts in a config-first quality contract so humans and AI agents execute the same deterministic checks.",
				true,
			),
		);
	}
	const missingDeclaredScripts = declaredQualityScripts.filter((scriptName) => !scripts[scriptName]);
	if (missingDeclaredScripts.length > 0) {
		findings.push(
			finding(
				"SW-BRK-GOV-002",
				"warning",
				"brick",
				"quality",
				"Quality scripts are declared but missing",
				missingDeclaredScripts.map((scriptName) => `.stackwarden/config.yml declares ${scriptName}`),
				"Add the missing package.json scripts or update the quality contract so declared checks are executable.",
				true,
			),
		);
	}
	if (hasGeneratedDocs(snapshot) && !hasProjectionFreshnessCheck(snapshot.packageJson?.scripts ?? {})) {
		findings.push(
			finding(
				"SW-BRK-GOV-003",
				"info",
				"brick",
				"projections",
				"Generated projection has no freshness check",
				["generated-from marker detected", "no docs:check/projections:check freshness script detected"],
				"Register a projection freshness command so generated documentation cannot silently drift from its source of truth.",
				true,
			),
		);
	}
	if (hasAgentInstructionSurface(snapshot) && !agentInstructionsAreDeterministic(snapshot.agentInstructionText)) {
		findings.push(
			finding(
				"SW-BRK-GOV-004",
				"info",
				"brick",
				"ai-guardrails",
				"AI operating rules are not deterministic",
				["agent instruction surface detected", "validation commands or safety boundaries are incomplete"],
				"Add concise, command-oriented guardrails covering validation commands, secrets, pushes, publication, and destructive edits.",
				true,
			),
		);
	}
	return findings;
}

/**
 * Internal inspiration matrix, intentionally kept out of user-facing copy:
 * - large monorepo governance: ownership, affected checks, build/test gates, code searchability;
 * - maintainer-driven open-source governance: contribution contracts, subsystem ownership, review discipline;
 * - regression-heavy infrastructure governance: deterministic harnesses, compatibility, release safety;
 * - hosted platform governance: security policy, review templates, semantic scanning, branch safeguards;
 * - product codebase governance: lint baselines, migration guards, design/safety gates, failed-test reruns.
 *
 * These source natures are used only to shape generic, client-safe audit heuristics.
 */
function detectRepoContext(snapshot) {
	const scripts = snapshot.packageJson?.scripts ?? {};
	const hasWeb = hasWebSurface(snapshot);
	const hasUi = hasWeb || snapshot.matches((file) => /(^|\/)(components|ui|design-system)(\/|\.)/.test(file));
	const hasMigrations = hasMigrationSurface(snapshot);
	const hasAutomation =
		hasScriptContaining(scripts, "agent") ||
		hasScriptContaining(scripts, "mastra") ||
		snapshot.matches((file) => /agent|mastra|worker|orchestrator/i.test(file));
	const isMonorepo =
		Boolean(snapshot.packageJson?.workspaces) ||
		snapshot.has("packages") ||
		snapshot.has("apps") ||
		snapshot.has("services");
	return {
		profile: isMonorepo ? "monorepo" : hasWeb ? "web-app" : "package",
		hasWeb,
		hasUi,
		hasMigrations,
		hasAutomation,
		isMonorepo,
	};
}

function hasWebSurface(snapshot) {
	return (
		Boolean(snapshot.packageJson?.dependencies?.next || snapshot.packageJson?.dependencies?.react) ||
		snapshot.has("apps/web") ||
		snapshot.matches(
			(file) =>
				basename(file).startsWith("playwright.config") || file.includes("/src/main.tsx") || file.includes("/app/"),
		)
	);
}

function hasMigrationSurface(snapshot) {
	return snapshot.matches(
		(file) => /migrations?\//i.test(file) || /supabase\/.*migrations/i.test(file) || file.endsWith(".sql"),
	);
}

function checkAssembly(snapshot) {
	/** @type {Finding[]} */
	const findings = [];
	const sourceFiles = snapshot.files.filter((file) => /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(file));
	const largeFiles = sourceFiles.filter((file) => safeSize(join(snapshot.root, file)) > 80_000);
	if (largeFiles.length > 0) {
		findings.push(
			finding(
				"SW-ASM-001",
				"warning",
				"assembly",
				"hotspots",
				"Large source files detected",
				largeFiles.slice(0, 5),
				"Review large source files as possible spaghetti or bug-factory hotspots.",
				false,
			),
		);
	}
	if (snapshot.packageJson && !snapshot.packageJson.workspaces && snapshot.has("packages")) {
		findings.push(
			finding(
				"SW-ASM-002",
				"info",
				"assembly",
				"workspace",
				"packages/ exists without package workspaces",
				["packages/ directory found", "package.json workspaces missing"],
				"If this is a monorepo, declare workspaces so package boundaries are explicit.",
				true,
			),
		);
	}
	return findings;
}

function checkHuman(snapshot) {
	/** @type {Finding[]} */
	const findings = [];
	if (!snapshot.has("CODEOWNERS") && !snapshot.has(".github/CODEOWNERS")) {
		findings.push(
			finding(
				"SW-HUM-001",
				"warning",
				"human",
				"ownership",
				"No CODEOWNERS detected",
				["CODEOWNERS missing in root and .github/"],
				"Add CODEOWNERS for critical paths to reduce ownership ambiguity and bus-factor risk.",
				true,
			),
		);
	}
	if (!snapshot.has("AGENTS.md") && !snapshot.has("CLAUDE.md")) {
		findings.push(
			finding(
				"SW-HUM-002",
				"info",
				"human",
				"agent-readiness",
				"No agent operating instructions detected",
				["AGENTS.md missing", "CLAUDE.md missing"],
				"Add agent instructions for repository-specific rules, validation, and protected paths.",
				true,
			),
		);
	}
	if (!snapshot.has(".stackwarden/capabilities.yml")) {
		findings.push(
			finding(
				"SW-HUM-003",
				"info",
				"human",
				"capabilities",
				"No StackWarden capabilities file detected",
				[".stackwarden/capabilities.yml missing"],
				"Run stackwarden init --write to declare accessible local capabilities and visibility boundaries.",
				true,
			),
		);
	}
	if (!snapshot.has(".stackwarden/config.yml")) {
		findings.push(
			finding(
				"SW-HUM-004",
				"info",
				"human",
				"client-config",
				"No StackWarden client configuration file detected",
				[".stackwarden/config.yml missing"],
				"Add .stackwarden/config.yml to tune advisory recommendations such as dependency-update policy for this repository.",
				true,
			),
		);
	}
	return findings;
}

function checkDocumentation(snapshot) {
	/** @type {Finding[]} */
	const findings = [];
	if (!snapshot.has("README.md")) {
		findings.push(
			finding(
				"SW-DOC-001",
				"warning",
				"human",
				"documentation",
				"README is not configured",
				["README.md missing"],
				"Add a README that explains purpose, setup, validation commands, architecture entry points, and operating constraints.",
				true,
			),
		);
	}
	if (!snapshot.has("CONTRIBUTING.md") && !snapshot.has(".github/CONTRIBUTING.md")) {
		findings.push(
			finding(
				"SW-DOC-002",
				"info",
				"human",
				"documentation",
				"Contribution guide is not configured",
				["CONTRIBUTING.md missing in root and .github/"],
				"Add CONTRIBUTING.md with branch, commit, review, test, release, and local setup expectations.",
				true,
			),
		);
	}
	if (!snapshot.has("CODE_OF_CONDUCT.md") && !snapshot.has(".github/CODE_OF_CONDUCT.md")) {
		findings.push(
			finding(
				"SW-DOC-003",
				"info",
				"human",
				"documentation",
				"Code of Conduct is not configured",
				["CODE_OF_CONDUCT.md missing in root and .github/"],
				"Add a Code of Conduct when the repository is open-source, community-facing, or has external contributors.",
				true,
			),
		);
	}
	if (!snapshot.has("SECURITY.md") && !snapshot.has(".github/SECURITY.md")) {
		findings.push(
			finding(
				"SW-DOC-004",
				"warning",
				"material",
				"security-policy",
				"Security policy is not configured",
				["SECURITY.md missing in root and .github/"],
				"Add SECURITY.md with supported versions, vulnerability reporting, disclosure process, and expected response policy.",
				true,
			),
		);
	}
	return findings;
}

function checkVelocity(snapshot) {
	const scripts = snapshot.packageJson?.scripts ?? {};
	/** @type {Finding[]} */
	const findings = [];
	for (const script of ["typecheck", "test", "build"]) {
		if (!scripts[script]) {
			findings.push(
				finding(
					`SW-VEL-${script.toUpperCase()}`,
					"warning",
					"velocity",
					"feedback-loop",
					`No ${script} script detected`,
					[`package.json scripts.${script} missing`],
					`Add a ${script} script so feedback loops can run deterministically in fast or deep checks.`,
					true,
				),
			);
		}
	}
	if (
		!snapshot.matches(
			(file) => file.startsWith(".github/workflows/") && (file.endsWith(".yml") || file.endsWith(".yaml")),
		)
	) {
		findings.push(
			finding(
				"SW-VEL-004",
				"warning",
				"velocity",
				"ci",
				"No GitHub workflow detected",
				[".github/workflows/*.yml missing in scanned files"],
				"Add at least one CI workflow for lint/typecheck/test gates.",
				true,
			),
		);
	}
	return findings;
}

function checkTooling(snapshot) {
	if (!snapshot.packageJson) return [];
	const dependencies = {
		...(snapshot.packageJson.dependencies ?? {}),
		...(snapshot.packageJson.devDependencies ?? {}),
	};
	const scripts = snapshot.packageJson.scripts ?? {};
	/** @type {Finding[]} */
	const findings = [];
	const hasDependency = (name) => Boolean(dependencies[name]);

	if (!hasDependency("knip") && !scripts.knip && !scripts["deadcode:scan"] && !scripts["deadcode:strict"]) {
		findings.push(
			finding(
				"SW-TOOL-001",
				"info",
				"assembly",
				"tooling",
				"Dead-code detection tool is not configured",
				["knip dependency/script not detected"],
				"Consider adding Knip with a non-blocking dead-code scan first, then promote to strict mode when the baseline is clean.",
				true,
			),
		);
	}
	if (!hasDependency("lefthook") && !snapshot.has("lefthook.yml")) {
		findings.push(
			finding(
				"SW-TOOL-002",
				"info",
				"velocity",
				"tooling",
				"Git hook orchestrator is not configured",
				["lefthook dependency/config not detected"],
				"Consider adding Lefthook to run fast checks before commit and heavier checks before push.",
				true,
			),
		);
	}
	if (!hasStagedFileRunner(snapshot, dependencies)) {
		findings.push(
			finding(
				"SW-TOOL-003",
				"info",
				"velocity",
				"tooling",
				"Staged-file quality runner is not configured",
				["no lint-staged config or equivalent staged-file hook detected"],
				"Consider adding lint-staged or configuring Lefthook/Husky/simple-git-hooks commands scoped to staged files so commit-time formatting and linting stay fast.",
				true,
			),
		);
	}
	if (!hasDependency("@commitlint/cli") && !hasDependency("commitlint")) {
		findings.push(
			finding(
				"SW-TOOL-004",
				"info",
				"human",
				"tooling",
				"Commit message policy is not configured",
				["commitlint dependency not detected"],
				"Consider adding commitlint when commit conventions matter for release notes, traceability, or team workflow.",
				true,
			),
		);
	}
	if (
		!hasDependency("@biomejs/biome") &&
		!hasDependency("eslint") &&
		!snapshot.has("biome.json") &&
		!snapshot.has("eslint.config.js")
	) {
		findings.push(
			finding(
				"SW-TOOL-005",
				"warning",
				"brick",
				"tooling",
				"No formatter/linter tool dependency detected",
				["no @biomejs/biome or eslint dependency/config detected"],
				"Install Biome or ESLint/Prettier to make atomic code-quality rules deterministic.",
				true,
			),
		);
	}
	if (!snapshot.has("renovate.json") && !snapshot.has(".github/dependabot.yml")) {
		findings.push(
			finding(
				"SW-TOOL-006",
				"info",
				"material",
				"tooling",
				"Dependency update bot is not configured",
				["renovate.json and .github/dependabot.yml not detected"],
				"Consider Renovate or Dependabot with release-age policy, grouped updates, and human review to improve dependency hygiene safely.",
				true,
			),
		);
	}
	if (
		!snapshot.has(".trivyignore") &&
		!scripts["security:update-db"] &&
		!snapshot.matches((file) => file.includes("trivy"))
	) {
		findings.push(
			finding(
				"SW-TOOL-007",
				"info",
				"material",
				"tooling",
				"Filesystem vulnerability scanner is not configured",
				["no trivy signal detected"],
				"Consider adding Trivy for filesystem vulnerability scans in deep audits or pre-push/CI.",
				true,
			),
		);
	}
	if (!hasDependency("eslint-plugin-security") && !hasDependency("eslint-plugin-sonarjs")) {
		findings.push(
			finding(
				"SW-TOOL-008",
				"info",
				"brick",
				"tooling",
				"Security/static-analysis ESLint plugins are not configured",
				["eslint-plugin-security and eslint-plugin-sonarjs not detected"],
				"Consider eslint-plugin-security or eslint-plugin-sonarjs for deterministic security and maintainability signals beyond formatting.",
				true,
			),
		);
	}
	if (
		hasWebSurface(snapshot) &&
		!hasScriptContaining(scripts, "e2e") &&
		!snapshot.matches((file) => basename(file).startsWith("playwright.config"))
	) {
		findings.push(
			finding(
				"SW-TOOL-009",
				"info",
				"velocity",
				"tooling",
				"End-to-end test runner is not configured",
				["test:e2e script and playwright.config.* not detected"],
				"Consider Playwright for business-critical user journeys, especially when the repository contains a web application.",
				true,
			),
		);
	}
	if (!snapshot.has(".github/pull_request_template.md")) {
		findings.push(
			finding(
				"SW-TOOL-010",
				"info",
				"human",
				"tooling",
				"Pull request template is not configured",
				[".github/pull_request_template.md not detected"],
				"Consider adding a PR template with validation, risk, screenshots, rollback, and business-test traceability sections.",
				true,
			),
		);
	}
	if (!snapshot.matches((file) => file.startsWith(".github/rulesets/"))) {
		findings.push(
			finding(
				"SW-TOOL-011",
				"info",
				"human",
				"tooling",
				"Repository ruleset export is not detected",
				[".github/rulesets/* not detected"],
				"Consider versioning GitHub branch/ruleset protection as code so repository safeguards are reviewable.",
				true,
			),
		);
	}
	if (!snapshot.matches((file) => file.startsWith(".github/workflows/") && file.toLowerCase().includes("codeql"))) {
		findings.push(
			finding(
				"SW-TOOL-012",
				"info",
				"material",
				"tooling",
				"CodeQL workflow is not configured",
				[".github/workflows/*codeql* not detected"],
				"Consider GitHub CodeQL for semantic security scanning in CI.",
				true,
			),
		);
	}
	if (!snapshot.matches((file) => file.startsWith(".github/workflows/") && file.toLowerCase().includes("scorecard"))) {
		findings.push(
			finding(
				"SW-TOOL-013",
				"info",
				"material",
				"tooling",
				"OpenSSF Scorecard workflow is not configured",
				[".github/workflows/*scorecard* not detected"],
				"Consider OpenSSF Scorecard to monitor repository supply-chain posture.",
				true,
			),
		);
	}
	if (
		(hasWebSurface(snapshot) || snapshot.matches((file) => /(^|\/)(components|ui|design-system)(\/|\.)/.test(file))) &&
		!scripts["design:gate"] &&
		!scripts["design:governance"] &&
		!scripts["design:lint"]
	) {
		findings.push(
			finding(
				"SW-TOOL-014",
				"info",
				"assembly",
				"tooling",
				"Design governance gate is not configured",
				["design:* governance scripts not detected"],
				"Consider a design governance gate for UI/design-system repositories to catch visual and design-token drift.",
				true,
			),
		);
	}
	if (!scripts["safety:gate"] && !snapshot.matches((file) => basename(file).includes("safety-gate"))) {
		findings.push(
			finding(
				"SW-TOOL-015",
				"info",
				"human",
				"tooling",
				"Autonomy safety gate is not configured",
				["safety gate script not detected"],
				"Consider an autonomy safety gate before agentic or high-blast-radius automation changes.",
				true,
			),
		);
	}
	if (
		!scripts["lint:baseline-guard"] &&
		!scripts["lint:ci"] &&
		!snapshot.matches((file) => basename(file).includes("lint-baseline"))
	) {
		findings.push(
			finding(
				"SW-TOOL-016",
				"info",
				"brick",
				"tooling",
				"Lint baseline guard is not configured",
				["lint baseline guard script not detected"],
				"Consider a lint baseline guard to prevent new lint debt while existing debt is burned down progressively.",
				true,
			),
		);
	}
	if (hasMigrationSurface(snapshot) && !snapshot.matches((file) => basename(file).includes("migration-timestamps"))) {
		findings.push(
			finding(
				"SW-TOOL-017",
				"info",
				"material",
				"tooling",
				"Migration timestamp collision guard is not configured",
				["migration timestamp guard not detected"],
				"Consider a migration timestamp guard when the repository contains database migrations to prevent duplicate or out-of-order migration files.",
				true,
			),
		);
	}
	if (!snapshot.matches((file) => basename(file).includes("no-relative-imports"))) {
		findings.push(
			finding(
				"SW-TOOL-018",
				"info",
				"assembly",
				"tooling",
				"Import-boundary guard is not configured",
				["no relative-import/domain-boundary guard detected"],
				"Consider an import-boundary guard to keep domain modules isolated and shared infrastructure from depending on product domains.",
				true,
			),
		);
	}
	if (hasWebSurface(snapshot) && !snapshot.matches((file) => basename(file).includes("bundle-budget"))) {
		findings.push(
			finding(
				"SW-TOOL-019",
				"info",
				"velocity",
				"tooling",
				"Bundle budget check is not configured",
				["bundle budget script not detected"],
				"Consider a bundle budget check for web/mobile applications to catch performance regressions before release.",
				true,
			),
		);
	}
	if (
		!scripts["test:unit:failed"] &&
		!scripts["test:edge:failed"] &&
		!snapshot.matches((file) => basename(file).includes("failed"))
	) {
		findings.push(
			finding(
				"SW-TOOL-020",
				"info",
				"velocity",
				"tooling",
				"Previously-failed test rerun loop is not configured",
				["failed-test rerun scripts not detected"],
				"Consider a smart rerun loop that executes previously failing tests first, then the full suite after they pass.",
				true,
			),
		);
	}
	if (!snapshot.matches((file) => file.startsWith(".github/workflows/") && file.toLowerCase().includes("release"))) {
		findings.push(
			finding(
				"SW-TOOL-021",
				"info",
				"human",
				"tooling",
				"Release automation workflow is not configured",
				["release workflow not detected"],
				"Consider release automation with generated release notes and explicit promotion gates.",
				true,
			),
		);
	}
	return findings;
}

function hasScriptContaining(scripts, token) {
	return Object.keys(scripts).some((script) => script.toLowerCase().includes(token));
}

function hasTypeScriptFiles(snapshot) {
	return snapshot.matches(
		(file) => file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".mts") || file.endsWith(".cts"),
	);
}

function hasCodeFiles(snapshot) {
	return snapshot.matches((file) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|css)$/.test(file));
}

function hasAnyTsconfig(snapshot) {
	return snapshot.has("tsconfig.json") || snapshot.matches((file) => /(^|\/)tsconfig[^/]*\.json$/.test(file));
}

function hasFormatterScript(scripts) {
	return Object.entries(scripts).some(([name, command]) => {
		const haystack = `${name} ${String(command)}`.toLowerCase();
		return name === "format" || haystack.includes("biome format") || haystack.includes("prettier");
	});
}

function tsconfigEnablesStrict(tsconfigText) {
	if (!tsconfigText) return false;
	return /"strict"\s*:\s*true/.test(tsconfigText);
}

function hasRepositoryQualityContract(snapshot) {
	const configText = snapshot.stackwardenConfigText ?? "";
	if (/qualityContract|quality:\s*\n|requiredScripts|validationCommands/.test(configText)) return true;
	return snapshot.has(".stackwarden/quality.yml") || snapshot.has(".stackwarden/quality.yml");
}

function getDeclaredQualityScripts(stackwardenConfigText) {
	if (!stackwardenConfigText) return [];
	const declared = new Set();
	let insideScriptList = false;
	for (const line of stackwardenConfigText.split(/\r?\n/)) {
		if (/^\s*requiredScripts\s*:\s*$/.test(line)) {
			insideScriptList = true;
			continue;
		}
		if (insideScriptList) {
			const item = line.match(/^\s*-\s*([\w:-]+)/);
			if (item) {
				declared.add(item[1]);
				continue;
			}
			if (line.trim() && !/^\s*#/.test(line)) insideScriptList = false;
		}
		const inline = line.match(/^\s*requiredScripts\s*:\s*\[(.*)]\s*$/);
		if (inline) {
			for (const scriptName of inline[2].split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, ""))) {
				if (scriptName) declared.add(scriptName);
			}
		}
	}
	return [...declared];
}

function hasGeneratedDocs(snapshot) {
	return snapshot.files
		.filter((file) => file.endsWith(".md"))
		.slice(0, 200)
		.some((file) => readTextIfExists(join(snapshot.root, file))?.includes("generated-from:"));
}

function hasProjectionFreshnessCheck(scripts) {
	return Object.entries(scripts).some(([name, command]) => {
		const haystack = `${name} ${String(command)}`.toLowerCase();
		return haystack.includes("docs:check") || haystack.includes("projections:check") || haystack.includes("--check");
	});
}

function hasAgentInstructionSurface(snapshot) {
	return Boolean(snapshot.agentInstructionText) || snapshot.has("AGENTS.md") || snapshot.has("CLAUDE.md");
}

function agentInstructionsAreDeterministic(agentInstructionText) {
	if (!agentInstructionText) return false;
	const text = agentInstructionText.toLowerCase();
	const hasValidationCommand = /\b(bun|npm|pnpm|yarn|node|make|cargo|go|pytest|ruff|biome|tsc)\s+/.test(text);
	const hasSecretBoundary = /secret|token|credential|private[- ]client/.test(text);
	const hasDestructiveBoundary = /destructive|delete|overwrite|production|approval/.test(text);
	const hasPublishBoundary =
		/no push|do not push|push without approval|no publish|do not publish|publish without approval/.test(text);
	return hasValidationCommand && hasSecretBoundary && hasDestructiveBoundary && hasPublishBoundary;
}

function hasStagedFileRunner(snapshot, dependencies) {
	if (dependencies["lint-staged"] || snapshot.packageJson?.["lint-staged"]) return true;
	const configText = `${snapshot.hookConfigText ?? ""}\n${snapshot.stackwardenConfigText ?? ""}`.toLowerCase();
	if (/stagedfilerunner\s*:/.test(configText)) return true;
	if (configText.includes("{staged_files}")) return true;
	return /git\s+diff\s+(--cached|--staged)|git\s+diff\s+--name-only\s+--cached/.test(configText);
}

function scriptOrHookContains(snapshot, token) {
	const scripts = snapshot.packageJson?.scripts ?? {};
	const haystack =
		`${Object.keys(scripts).join("\n")}\n${Object.values(scripts).join("\n")}\n${snapshot.hookConfigText ?? ""}`.toLowerCase();
	return haystack.includes(token.toLowerCase());
}

function checkContinuousImprovement(snapshot) {
	const findings = [];
	if (
		!scriptOrHookContains(snapshot, "stackwarden hook pre-commit") &&
		!scriptOrHookContains(snapshot, "stackwarden audit --fast")
	) {
		findings.push(
			finding(
				"SW-LOOP-001",
				"info",
				"velocity",
				"continuous-improvement",
				"Fast audit is not wired into the commit loop",
				["no pre-commit command invoking stackwarden audit --fast or stackwarden hook pre-commit detected"],
				"Wire `stackwarden hook pre-commit` into Lefthook, Husky, or Git hooks so every commit receives local, advisory improvement recommendations.",
				true,
			),
		);
	}
	if (!scriptOrHookContains(snapshot, "commit-size") && !scriptOrHookContains(snapshot, "check-commit-size")) {
		findings.push(
			finding(
				"SW-LOOP-002",
				"info",
				"human",
				"continuous-improvement",
				"Commit-size guard is not configured",
				["no commit-size guard detected in scripts or hooks"],
				"Add a commit-size guard with soft and hard limits to encourage small, reviewable changes and reduce review risk.",
				true,
			),
		);
	}
	if (!scriptOrHookContains(snapshot, "affected") && snapshot.packageJson?.workspaces) {
		findings.push(
			finding(
				"SW-LOOP-003",
				"info",
				"velocity",
				"continuous-improvement",
				"Affected-check loop is not configured",
				["workspaces detected", "no affected-check command detected"],
				"Add affected lint/typecheck/test/build checks so changed workspaces get fast, targeted validation before broader CI.",
				true,
			),
		);
	}
	if (!scriptOrHookContains(snapshot, "env:drift") && !scriptOrHookContains(snapshot, "env drift")) {
		findings.push(
			finding(
				"SW-LOOP-004",
				"info",
				"material",
				"continuous-improvement",
				"Environment drift loop is not configured",
				["no env drift script or hook detected"],
				"Add an environment drift check that compares real env files with `.env.example` without printing values, so config changes stay explicit.",
				true,
			),
		);
	}
	if (!scriptOrHookContains(snapshot, "docs:governance") && !scriptOrHookContains(snapshot, "documentation")) {
		findings.push(
			finding(
				"SW-LOOP-005",
				"info",
				"assembly",
				"continuous-improvement",
				"Documentation drift loop is not configured",
				["no documentation governance/drift command detected"],
				"Add a documentation drift check that distinguishes generated documentation, approved handwritten docs, and stale unmanaged Markdown.",
				true,
			),
		);
	}
	return findings;
}

function checkBusinessTesting(snapshot) {
	if (snapshot.mode !== "deep") return [];
	const hasBusinessSurface = snapshot.matches((file) => /(^|\/)(business|domain|rules|workflows)(\/|\.)/.test(file));
	const hasAcceptanceSurface = snapshot.matches(
		(file) =>
			file.endsWith(".feature") || file.includes("acceptance.test.") || file.includes("business-acceptance.test."),
	);
	if (!hasBusinessSurface || hasAcceptanceSurface) return [];
	return [
		finding(
			"SW-BIZ-001",
			"warning",
			"brick",
			"business-testing",
			"Business-critical surface has no acceptance test signal",
			["business/domain/rules/workflows surface detected", "no .feature or acceptance test detected"],
			"Add a Gherkin feature or acceptance test that turns business intent into executable, traceable behavior.",
			true,
		),
	];
}

function checkLean5S(snapshot) {
	if (snapshot.mode !== "deep") return [];
	const markdownFiles = snapshot.files.filter((file) => file.endsWith(".md") || file.endsWith(".mdx"));
	const duplicateNames = duplicateBasenames(markdownFiles);
	if (duplicateNames.length === 0) return [];
	return [
		finding(
			"SW-5S-001",
			"info",
			"assembly",
			"lean-5s",
			"Potential duplicate documentation surfaces detected",
			duplicateNames.slice(0, 5),
			"Run a 5S cleanup: sort duplicate docs, define the canonical source, archive stale surfaces, and standardize generated projections.",
			false,
		),
	];
}

function duplicateBasenames(files) {
	const counts = new Map();
	for (const file of files) counts.set(basename(file), (counts.get(basename(file)) ?? 0) + 1);
	return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

/** @param {Finding[]} findings */
function makeGiveFinding(findings) {
	const top =
		findings.find((item) => item.severity === "error") ??
		findings.find((item) => item.severity === "warning") ??
		findings[0];
	if (!top) {
		return finding(
			"SW-GIV-001",
			"info",
			"give",
			"team-action",
			"No urgent team action found",
			["no error or warning findings"],
			"Keep the current governance baseline and schedule the next deep audit.",
			false,
		);
	}
	return finding(
		"SW-GIV-001",
		"info",
		"give",
		"team-action",
		"Recommended next team action",
		[`derived from ${top.id}`],
		top.recommendation,
		top.fixable,
	);
}

function safeSize(path) {
	try {
		return statSync(path).size;
	} catch {
		return 0;
	}
}

/**
 * @param {string} id
 * @param {Severity} severity
 * @param {LevelId} level
 * @param {string} domain
 * @param {string} title
 * @param {string[]} evidence
 * @param {string} recommendation
 * @param {boolean} fixable
 * @returns {Finding}
 */
function finding(id, severity, level, domain, title, evidence, recommendation, fixable) {
	return {
		id,
		title,
		severity,
		level,
		domain,
		message: title,
		evidence,
		recommendation,
		fixable,
		confidence: "medium",
		accessTier: "core",
		visibility: "full",
		implemented: true,
		relevance: true,
	};
}

/** @param {Finding[]} findings */
function scoreFindings(findings) {
	const byLevel = Object.fromEntries(
		LEVELS.map((level) => {
			const levelFindings = findings.filter((finding) => finding.level === level.id);
			const penalty = levelFindings.reduce((sum, finding) => sum + severityPenalty(finding.severity), 0);
			return [level.id, { label: level.label, score: Math.max(0, 100 - penalty), findings: levelFindings.length }];
		}),
	);
	const global = Math.round(LEVELS.reduce((sum, level) => sum + byLevel[level.id].score, 0) / LEVELS.length);
	return { global, byLevel };
}

/** @param {Severity} severity */
function severityPenalty(severity) {
	if (severity === "error") return 35;
	if (severity === "warning") return 18;
	return 5;
}

/** @param {Finding[]} findings */
function summarize(findings) {
	return {
		total: findings.length,
		errors: findings.filter((finding) => finding.severity === "error").length,
		warnings: findings.filter((finding) => finding.severity === "warning").length,
		info: findings.filter((finding) => finding.severity === "info").length,
	};
}

/** @param {Finding[]} findings */
function topRecommendations(findings) {
	return findings
		.filter((finding) => finding.level !== "give")
		.sort((a, b) => severityPenalty(b.severity) - severityPenalty(a.severity))
		.slice(0, 5)
		.map((finding) => ({
			id: finding.id,
			level: finding.level,
			severity: finding.severity,
			recommendation: finding.recommendation,
		}));
}

export function planRepository(targetPath = ".", options = { mode: "deep", json: false, verbose: false }) {
	const audit = auditRepository(targetPath, { ...options, mode: "deep" });
	const actions = audit.findings
		.filter((finding) => finding.level !== "give")
		.map((finding) => ({
			id: `PLAN-${finding.id}`,
			findingId: finding.id,
			level: finding.level,
			category: planCategory(finding),
			priority: planPriority(finding),
			phase: planPhase(finding),
			status: "recommended",
			blocking: false,
			title: finding.title,
			recommendation: finding.recommendation,
			evidence: finding.evidence,
		}));
	return {
		schemaVersion: 1,
		tool: audit.tool,
		metadata: audit.metadata,
		score: audit.scores.global,
		levelScores: audit.scores.byLevel,
		summary: {
			actions: actions.length,
			stronglyRecommended: actions.filter((action) => action.priority === "high").length,
			quickWins: actions.filter((action) => action.category === "quick-win").length,
			phases: {
				now: actions.filter((action) => action.phase === "now").length,
				next: actions.filter((action) => action.phase === "next").length,
				later: actions.filter((action) => action.phase === "later").length,
			},
		},
		actions,
	};
}

function planCategory(finding) {
	if (finding.id.startsWith("SW-TOOL")) return "standardize-tooling";
	if (finding.id.startsWith("SW-MAT")) return "reduce-supply-chain-risk";
	if (finding.id.startsWith("SW-HUM")) return "clarify-team-governance";
	if (finding.id.startsWith("SW-DOC-004")) return "reduce-supply-chain-risk";
	if (finding.id.startsWith("SW-DOC")) return "clarify-team-governance";
	if (finding.id.startsWith("SW-BIZ")) return "add-business-test";
	if (finding.id.startsWith("SW-LOOP")) return "continuous-improvement-loop";
	if (finding.id.startsWith("SW-5S")) return "quick-win";
	return "improve-codebase-health";
}

function planPhase(finding) {
	if (finding.severity === "error") return "now";
	if (finding.severity === "warning") return "now";
	if (["SW-TOOL-006", "SW-TOOL-012", "SW-TOOL-013", "SW-DOC-004", "SW-LOOP-001"].includes(finding.id)) return "next";
	return "later";
}

function planPriority(finding) {
	if (finding.severity === "error") return "high";
	if (finding.severity === "warning") return "medium";
	if (["SW-TOOL-006", "SW-TOOL-012", "SW-TOOL-013", "SW-LOOP-001"].includes(finding.id)) return "medium";
	return "low";
}

export function runCheck(name, targetPath = ".", options = { json: false, ci: false, strict: false }) {
	const checkOptions = resolveCheckOptions(name, targetPath, options);
	if (name === "commit-size") return checkCommitSize(targetPath, checkOptions);
	if (name === "env-drift") return checkEnvDrift(targetPath, checkOptions);
	if (name === "docs-drift") return checkDocsDrift(targetPath, checkOptions);
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: name,
		blocking: Boolean(options.strict),
		status: "unknown-check",
		violations: [`Unknown check: ${name}`],
		warnings: [],
	};
}

function resolveCheckOptions(name, targetPath, options = { strict: false }) {
	const policy = readCheckPolicy(targetPath, name);
	const strict = Boolean(options.strict || policy.blocking);
	return {
		...options,
		strict,
		enforcement: options.strict ? "strict" : policy.blocking ? "configured" : "advisory",
		policy,
	};
}

function readCheckPolicy(targetPath, name) {
	const config = readTextIfExists(join(resolve(targetPath), ".stackwarden/config.yml")) ?? "";
	const key = checkConfigKey(name);
	return {
		blocking: readNestedBoolean(config, key, "blocking") ?? false,
	};
}

function checkConfigKey(name) {
	return (
		{
			"commit-size": "commitSize",
			"env-drift": "envDrift",
			"docs-drift": "documentationDrift",
		}[name] ?? name
	);
}

function readNestedBoolean(source, sectionKey, propertyKey) {
	const section = source.match(
		new RegExp(`(^|\\n)\\s{2,}${sectionKey}:\\s*\\n([\\s\\S]*?)(?=\\n\\s{0,4}[A-Za-z0-9_-]+:|$)`),
	);
	if (!section) return undefined;
	const property = section[2].match(new RegExp(`(^|\\n)\\s+${propertyKey}:\\s*(true|false)\\s*(\\n|$)`));
	return property ? property[2] === "true" : undefined;
}

function checkCommitSize(targetPath = ".", options = { strict: false, enforcement: "advisory" }) {
	const commitSize = inspectStagedCommitSize(targetPath);
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: "commit-size",
		blocking: Boolean(options.strict && commitSize.hardLimitExceeded),
		wouldBlockIfStrict: Boolean(commitSize.hardLimitExceeded),
		enforcement: options.enforcement ?? (options.strict ? "strict" : "advisory"),
		status: commitSize.hardLimitExceeded ? "failed" : commitSize.softLimitExceeded ? "warning" : "passed",
		violations: commitSize.hardLimitExceeded ? ["staged commit exceeds hard size limit"] : [],
		warnings: commitSize.softLimitExceeded ? ["staged commit exceeds recommended soft size"] : [],
		commitSize,
	};
}

function checkEnvDrift(targetPath = ".", options = { strict: false, enforcement: "advisory" }) {
	const root = resolve(targetPath);
	const files = listFiles(root, 3000).map(normalizePath);
	const exampleFiles = files.filter((file) => basename(file) === ".env.example");
	const reports = [];
	const violations = [];
	const warnings = [];
	for (const exampleFile of exampleFiles) {
		const example = parseEnvFile(join(root, exampleFile));
		for (const realFile of [join(dirname(exampleFile), ".env"), join(dirname(exampleFile), ".env.local")].map(
			normalizePath,
		)) {
			if (!files.includes(realFile)) continue;
			const real = parseEnvFile(join(root, realFile));
			const missing = example.keys.filter((key) => !real.keys.includes(key));
			const extra = real.keys.filter((key) => !example.keys.includes(key));
			const duplicateKeys = real.duplicateKeys;
			const plainValueKeys = real.entries
				.filter((entry) => entry.hasValue && !isSecretReference(entry.value))
				.map((entry) => ({ key: entry.key, line: entry.line }));
			const report = { exampleFile, realFile, missing, extra, duplicateKeys, plainValueKeys };
			reports.push(report);
			if (missing.length > 0 || extra.length > 0 || duplicateKeys.length > 0) {
				violations.push(`${realFile} drifts from ${exampleFile}`);
			}
			if (plainValueKeys.length > 0) warnings.push(`${realFile} contains local clear-text values`);
		}
	}
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: "env-drift",
		blocking: Boolean(options.strict && violations.length > 0),
		wouldBlockIfStrict: violations.length > 0,
		enforcement: options.enforcement ?? (options.strict ? "strict" : "advisory"),
		status: violations.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
		violations,
		warnings,
		reports,
	};
}

function parseEnvFile(path) {
	const entries = [];
	for (const [index, line] of readFileSync(path, "utf8").split("\n").entries()) {
		const entry = parseEnvEntry(line, index + 1);
		if (entry) entries.push(entry);
	}
	const counts = new Map();
	for (const entry of entries) counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
	const keys = [...counts.keys()];
	return { entries, keys, duplicateKeys: keys.filter((key) => (counts.get(key) ?? 0) > 1) };
}

function parseEnvEntry(rawLine, line) {
	const trimmed = rawLine.trim();
	if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return null;
	const key = trimmed
		.split("=", 1)[0]
		.replace(/^export\s+/, "")
		.trim();
	const value = trimmed
		.slice(trimmed.indexOf("=") + 1)
		.trim()
		.replace(/^['"]|['"]$/g, "");
	if (!key) return null;
	return { key, value, line, hasValue: value.length > 0 };
}

function isSecretReference(value) {
	return value.startsWith("op://") || value.startsWith("vault://") || value.includes("${") || /^<.+>$/.test(value);
}

function checkDocsDrift(targetPath = ".", options = { strict: false, enforcement: "advisory" }) {
	const root = resolve(targetPath);
	const files = listFiles(root, 3000)
		.map(normalizePath)
		.filter((file) => file.endsWith(".md") || file.endsWith(".mdx"));
	const violations = [];
	const warnings = [];
	for (const file of files) {
		const lower = file.toLowerCase();
		const generatedPath = lower.includes("/generated/") || lower.includes("/dist/") || lower.includes("/build/");
		if (!generatedPath) continue;
		const head = readTextIfExists(join(root, file))?.slice(0, 1000) ?? "";
		if (!hasGeneratedMarker(head)) violations.push(`${file} appears generated but has no generated marker`);
	}
	for (const name of duplicateBasenames(files).slice(0, 10))
		warnings.push(`duplicate Markdown basename detected: ${name}`);
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: "docs-drift",
		blocking: Boolean(options.strict && violations.length > 0),
		wouldBlockIfStrict: violations.length > 0,
		enforcement: options.enforcement ?? (options.strict ? "strict" : "advisory"),
		status: violations.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
		violations,
		warnings,
		filesChecked: files.length,
	};
}

function hasGeneratedMarker(source) {
	return ["generated-from:", "AUTO-GENERATED FROM", "auto-generated-from:", "@generated from:"].some((marker) =>
		source.includes(marker),
	);
}

function printCheckResult(result) {
	console.log(color.bold(`StackWarden check ${result.check}: ${result.status}`));
	for (const violation of result.violations ?? []) console.error(`- ${violation}`);
	for (const warning of result.warnings ?? []) console.warn(`- ${warning}`);
}

export function runPreCommitHook(targetPath = ".", options = { json: false, ci: false, strict: false }) {
	const report = auditRepository(targetPath, { mode: "fast", json: Boolean(options.json), verbose: false });
	const commitSizeCheck = runCheck("commit-size", targetPath, options);
	const commitSize = commitSizeCheck.commitSize;
	const blocking = Boolean(commitSizeCheck.blocking);
	return {
		schemaVersion: 1,
		tool: report.tool,
		hook: "pre-commit",
		blocking,
		audit: {
			score: report.scores.global,
			summary: report.summary,
			recommendations: report.recommendations,
		},
		commitSize,
	};
}

function inspectStagedCommitSize(targetPath) {
	const root = resolve(targetPath);
	let output = "";
	try {
		output = execFileSync("git", ["diff", "--cached", "--numstat"], {
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return { available: false, stagedFiles: 0, changedTextLines: 0, hardLimitExceeded: false };
	}
	const warnFiles = Number(process.env.COMMIT_SIZE_WARN_FILES ?? 25);
	const warnLines = Number(process.env.COMMIT_SIZE_WARN_LINES ?? 800);
	const failFiles = Number(process.env.COMMIT_SIZE_FAIL_FILES ?? 80);
	const failLines = Number(process.env.COMMIT_SIZE_FAIL_LINES ?? 2500);
	let stagedFiles = 0;
	let changedTextLines = 0;
	let binaryFiles = 0;
	for (const line of output.split("\n").filter(Boolean)) {
		const [added, deleted] = line.split("\t");
		stagedFiles += 1;
		if (added === "-" || deleted === "-") {
			binaryFiles += 1;
			continue;
		}
		changedTextLines += Number(added) + Number(deleted);
	}
	return {
		available: true,
		stagedFiles,
		changedTextLines,
		binaryFiles,
		softLimitExceeded: stagedFiles > warnFiles || changedTextLines > warnLines,
		hardLimitExceeded: stagedFiles > failFiles || changedTextLines > failLines,
		limits: { warnFiles, warnLines, failFiles, failLines },
	};
}

function printHookResult(result) {
	console.log(color.bold(`StackWarden ${result.hook} · Score ${scoreColor(result.audit.score)}/100`));
	if (result.commitSize?.available) {
		console.log(
			color.dim(
				`Commit size: ${result.commitSize.stagedFiles} staged file(s), ${result.commitSize.changedTextLines} changed text line(s)`,
			),
		);
	}
	if (result.audit.recommendations.length === 0) {
		console.log("No fast-audit recommendations.");
		return;
	}
	console.log("Fast-audit recommendations:");
	for (const [index, recommendation] of result.audit.recommendations.entries()) {
		console.log(`  ${index + 1}. [${recommendation.id}] ${recommendation.recommendation}`);
	}
	if (result.blocking) console.error("Commit-size hard limit exceeded.");
}

function printPlan(plan) {
	console.log(color.bold(`StackWarden Plan · Score ${scoreColor(plan.score)}/100`));
	console.log(
		color.dim(`${plan.summary.actions} recommended action(s) · ${plan.summary.stronglyRecommended} high priority\n`),
	);
	if (plan.actions.length === 0) {
		console.log("No standardization actions recommended.");
		return;
	}
	for (const [index, action] of plan.actions.slice(0, 12).entries()) {
		console.log(`${index + 1}. [${action.phase}/${action.priority}] ${action.title}`);
		console.log(color.dim(`   ${action.category} · ${action.findingId}`));
		console.log(`   ${action.recommendation}`);
	}
}

function printAuditReport(report) {
	console.log(color.bold(`StackWarden Score: ${scoreColor(report.scores.global)}/100`));
	console.log(
		color.dim(
			`${report.metadata.mode} audit · ${report.metadata.filesVisited} files scanned · ${report.metadata.durationMs}ms\n`,
		),
	);
	for (const level of LEVELS) {
		const score = report.scores.byLevel[level.id].score;
		console.log(`${level.label.padEnd(29)} ${scoreColor(score)}/100`);
	}
	console.log("\nTop recommendations:");
	if (report.recommendations.length === 0) console.log("  No recommendations.");
	for (const [index, recommendation] of report.recommendations.entries()) {
		console.log(`  ${index + 1}. [${recommendation.id}] ${recommendation.recommendation}`);
	}
}

function scoreColor(score) {
	const value = String(score).padStart(3, " ");
	if (score >= 80) return color.green(value);
	if (score >= 60) return color.yellow(value);
	return color.red(value);
}

export function initRepository(targetPath = ".", options = { write: false, json: false }) {
	const root = resolve(targetPath);
	const files = [
		{
			path: ".stackwarden/capabilities.yml",
			content: defaultCapabilities(),
		},
		{
			path: ".stackwarden/config.yml",
			content: defaultConfig(),
		},
		{
			path: ".stackwarden/lefthook.yml",
			content: defaultLefthook(),
		},
		{
			path: ".stackwarden/hooks/pre-commit",
			content: defaultPreCommitHook(),
		},
	];
	const planned = files.map((file) => {
		const absolute = join(root, file.path);
		const exists = existsSync(absolute);
		if (options.write && !exists) {
			mkdirSync(dirname(absolute), { recursive: true });
			writeFileSync(absolute, file.content);
		}
		return { path: file.path, action: exists ? "skip-existing" : options.write ? "created" : "would-create" };
	});
	return { root, write: Boolean(options.write), changes: planned };
}

function defaultCapabilities() {
	return `$schema: ../schemas/capabilities.schema.json
version: 1
name: stackwarden-capabilities

access:
  tier: core
  mode: local
  visibility: full

capabilities:
  rules:
    core:
      enabled: true
      execution: local
      visibility: full
    premium:
      enabled: false
      execution: server
      visibility: masked
  scripts:
    auditFast:
      enabled: true
      command: stackwarden audit --fast
    auditDeep:
      enabled: true
      command: stackwarden audit --deep
    preCommitLoop:
      enabled: true
      command: stackwarden hook pre-commit
    envDrift:
      enabled: true
      command: stackwarden check env-drift
    docsDrift:
      enabled: true
      command: stackwarden check docs-drift
    commitSize:
      enabled: true
      command: stackwarden check commit-size
  features:
    terminalScore:
      enabled: true
    jsonExport:
      enabled: true
    serverRules:
      enabled: false

policy:
  addCapabilityWhen:
    implementedInCode: true
    relevantForClientUse: true
  doNotExposePremiumRuleLogic: true
`;
}

function defaultConfig() {
	return `$schema: ../schemas/config.schema.json
version: 1
name: stackwarden-config

recommendationPolicy:
  defaultSeverity: advisory
  blockOnRecommendedConfigMissing: false
  explainWhenConfigWouldImproveSignal: true

material:
  dependencyUpdates:
    enabled: true
    mode: recommend
    autoApply: false
    packageManagers:
      npm: true
      pnpm: true
      yarn: true
      bun: true
    allowMajorUpdates: false
    allowMinorUpdates: true
    allowPatchUpdates: true
    requireHumanReview: true
    securityOnly: false
    supplyChainProtection:
      blockFreshReleases: true
      minimumReleaseAgeDays: 3
      rationale: >-
        Delay dependency upgrades to reduce exposure to newly published
        malicious packages, supply-chain compromise, and exfiltration attacks.
      supportedPackageJsonConfigKeys:
        - minimumReleaseAge
        - minimumReleaseAgeDays
        - minimumDependencyReleaseAgeDays
    commands:
      npm: npm outdated
      pnpm: pnpm outdated
      yarn: yarn outdated
      bun: bun outdated

qualityContract:
  requiredScripts:
    - lint
    - typecheck
    - test
  validationCommands:
    - lint
    - typecheck
    - test
  rationale: >-
    Keep repository validation explicit so humans and AI agents run the same
    deterministic commands before handing work over.

governance:
  recommendedFiles:
    - README.md
    - CODEOWNERS
    - .github/workflows
    - .stackwarden/capabilities.yml

continuousImprovement:
  preCommitFastAudit:
    enabled: true
    command: stackwarden hook pre-commit
    blocking: false
  commitSize:
    blocking: false
    warnFiles: 25
    warnLines: 800
    failFiles: 80
    failLines: 2500
  envDrift:
    blocking: false
    recommended: true
  documentationDrift:
    blocking: false
    recommended: true
  affectedChecks:
    recommendedForWorkspaces: true
`;
}

function defaultLefthook() {
	return `$schema: ../schemas/lefthook-template.schema.json
# Optional Lefthook integration generated by StackWarden.
# Copy or extend this from your root lefthook.yml when you want commit-time feedback.
pre-commit:
  parallel: false
  commands:
    stackwarden-fast-audit:
      run: stackwarden hook pre-commit
`;
}

function defaultPreCommitHook() {
	return `#!/usr/bin/env sh
set -eu

# Advisory local loop: runs a fast StackWarden audit and commit-size guard.
stackwarden hook pre-commit
`;
}

function printInitResult(result) {
	console.log(color.bold(`StackWarden init ${result.write ? "write" : "dry-run"}`));
	for (const change of result.changes) console.log(`- ${change.action}: ${change.path}`);
	if (!result.write) console.log(color.dim("Run with --write to create missing files."));
}

function isExecutedFile() {
	if (!process.argv[1]) return false;
	try {
		return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
	} catch {
		return fileURLToPath(import.meta.url) === process.argv[1];
	}
}

if (isExecutedFile()) main();
