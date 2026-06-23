#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
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
	if (command === "generate") {
		const result = runGenerate(checkName ?? path, checkName ? path : ".", options);
		if (options.json) console.log(JSON.stringify(result, null, 2));
		else printGenerateResult(result);
		process.exitCode = result.blocking ? 1 : 0;
		return;
	}
	if (command === "affected") {
		const result = runAffected(checkName ?? path, checkName ? path : ".", options);
		if (options.json) console.log(JSON.stringify(result, null, 2));
		else printAffectedResult(result);
		process.exitCode = result.blocking ? 1 : 0;
		return;
	}
	if (command === "governance") {
		const result = runGovernance(checkName ?? "status", checkName ? path : ".", options);
		if (options.json) console.log(JSON.stringify(result, null, 2));
		else printGovernanceResult(result);
		process.exitCode = result.blocking ? 1 : 0;
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
	/** @type {AuditOptions & { write: boolean, help: boolean, version: boolean, ci: boolean, strict: boolean, dryRun: boolean, base?: string }} */
	const options = {
		mode: "fast",
		json: false,
		verbose: false,
		write: false,
		help: false,
		version: false,
		ci: false,
		strict: false,
		dryRun: false,
	};
	let command;
	let checkName;
	let path = ".";
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--fast") options.mode = "fast";
		else if (arg === "--deep") options.mode = "deep";
		else if (arg === "--json") options.json = true;
		else if (arg === "--verbose") options.verbose = true;
		else if (arg === "--write") options.write = true;
		else if (arg === "--dry-run") options.dryRun = true;
		else if (arg === "--base") options.base = argv[++index];
		else if (arg.startsWith("--base=")) options.base = arg.slice("--base=".length);
		else if (arg === "--ci") options.ci = true;
		else if (arg === "--strict") options.strict = true;
		else if (arg === "--help" || arg === "-h") options.help = true;
		else if (arg === "--version" || arg === "-v") options.version = true;
		else if (!command) command = arg;
		else if (["check", "generate", "affected", "governance"].includes(command) && !checkName) checkName = arg;
		else path = arg;
	}
	return { command: command ?? "help", path, checkName, options };
}

function printHelp() {
	console.log(
		`StackWarden ${VERSION}\n\nUsage:\n  stackwarden audit [path] [--fast|--deep] [--json] [--ci]\n  stackwarden init [path] [--write] [--json]\n  stackwarden plan [path] [--json]\n  stackwarden hook pre-commit [--json] [--ci]
  stackwarden check <commit-size|env-drift|docs-drift|codeowners|workspaces|pipeline|agents|projections|governance|local-bypass> [--json] [--strict]
  stackwarden generate <codeowners|workspaces|agents> [path] [--json]
  stackwarden governance <status|diff> [path] [--json] [--strict]
  stackwarden affected <checks|tests|builds|verify> [path] [--base origin/main] [--dry-run] [--json]

Examples:
  stackwarden audit --fast\n  stackwarden audit . --deep --json\n  stackwarden init /tmp/repo --write\n  stackwarden plan .\n  stackwarden hook pre-commit\n  stackwarden check env-drift --json
  stackwarden check codeowners /tmp/repo --json
  stackwarden generate workspaces
  stackwarden governance status --json
  stackwarden governance diff
  stackwarden affected verify --base origin/main --dry-run`,
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

export function runCheck(name, targetPath = ".", options = {}) {
	const checkOptions = resolveCheckOptions(name, targetPath, options);
	if (name === "commit-size") return checkCommitSize(targetPath, checkOptions);
	if (name === "env-drift") return checkEnvDrift(targetPath, checkOptions);
	if (name === "docs-drift") return checkDocsDrift(targetPath, checkOptions);
	if (name === "codeowners") return checkCodeownersCommand(targetPath, checkOptions);
	if (name === "workspaces") return checkWorkspacesCommand(targetPath, checkOptions);
	if (name === "pipeline") return checkPipelineCommand(targetPath, checkOptions);
	if (name === "agents") return checkAgentsCommand(targetPath, checkOptions);
	if (name === "projections") return checkProjectionsCommand(targetPath, checkOptions);
	if (name === "governance") return checkGovernanceCommand(targetPath, checkOptions);
	if (name === "local-bypass") return checkLocalBypassCommand(targetPath, checkOptions);
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: name,
		blocking: Boolean(options.strict),
		wouldBlockIfStrict: true,
		enforcement: options.strict ? "strict" : "advisory",
		status: "unknown-check",
		violations: [`Unknown check: ${name}`],
		warnings: [],
	};
}

function resolveCheckOptions(name, targetPath, options = {}) {
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
			codeowners: "codeowners",
			workspaces: "workspaces",
			pipeline: "pipeline",
			agents: "agents",
			projections: "projections",
			governance: "governance",
			"local-bypass": "localBypass",
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
	const commitSize = /** @type {any} */ (commitSizeCheck).commitSize;
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

export function runGenerate(name, targetPath = ".", options = { json: false }) {
	if (name === "codeowners") return generateCodeownersCommand(targetPath, options);
	if (name === "workspaces") return generateWorkspacesCommand(targetPath, options);
	if (name === "agents") return generateAgentsCommand(targetPath, options);
	return unknownCommandResult("generate", name, options);
}

function generateAgentsCommand(targetPath = ".", _options = {}) {
	const root = resolve(targetPath);
	const result = evaluateAgents(root);
	if (result.violations.length > 0) return result;
	for (const [file, content] of result.outputs) {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content);
	}
	return { ...result, status: "generated", changed: result.stale.length > 0 };
}

function checkAgentsCommand(targetPath = ".", options = {}) {
	const result = evaluateAgents(resolve(targetPath));
	const violations = [
		...result.violations,
		...result.stale.map((file) => `${file} is stale. Run stackwarden generate agents.`),
	];
	return {
		...result,
		blocking: Boolean(options.strict && violations.length > 0),
		wouldBlockIfStrict: violations.length > 0,
		enforcement: options.enforcement ?? (options.strict ? "strict" : "advisory"),
		status: violations.length > 0 ? "failed" : "passed",
		violations,
	};
}

function evaluateAgents(root) {
	const rulesPath = resolve(root, ".stackwarden/agent-rules.yml");
	const agentsPath = resolve(root, ".stackwarden/agents.yml");
	const violations = [];
	if (!existsSync(rulesPath)) violations.push("missing agent rules source: .stackwarden/agent-rules.yml");
	if (!existsSync(agentsPath)) violations.push("missing agents source: .stackwarden/agents.yml");
	const rules = existsSync(rulesPath)
		? parseAgentRules(readFileSync(rulesPath, "utf8"))
		: { title: "Repository agent playbook", instructions: [], validation: [] };
	const agents = existsSync(agentsPath) ? parseAgentsConfig(readFileSync(agentsPath, "utf8")) : [];
	const outputs = new Map();
	for (const agent of agents.filter((agent) => agent.enabled !== false)) {
		if (!agent.target) {
			violations.push(`agent ${agent.id || "<unknown>"} missing target`);
			continue;
		}
		outputs.set(resolve(root, agent.target), renderAgentProjection(agent, rules));
	}
	const stale = [];
	for (const [file, expected] of outputs) {
		if (!existsSync(file) || readFileSync(file, "utf8") !== expected)
			stale.push(normalizePath(file.slice(root.length + 1)));
	}
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: "agents",
		blocking: false,
		status: violations.length > 0 ? "failed" : stale.length > 0 ? "stale" : "passed",
		violations,
		warnings: [],
		sources: [".stackwarden/agent-rules.yml", ".stackwarden/agents.yml"],
		stale,
		outputs,
	};
}

function parseAgentRules(source) {
	const rules = /** @type {any} */ ({ title: "Repository agent playbook", instructions: [], validation: [] });
	let listKey = "";
	for (const rawLine of source.replace(/\r/g, "").split("\n")) {
		const lineWithoutComment = rawLine.replace(/\s+#.*$/, "");
		if (!lineWithoutComment.trim()) continue;
		const indent = lineWithoutComment.match(/^\s*/)?.[0].length ?? 0;
		const line = lineWithoutComment.trim();
		if (indent === 0) {
			const scalar = line.match(/^(title|name):\s*(.*)$/);
			if (scalar && scalar[1] === "title") rules.title = cleanYamlScalar(scalar[2]);
			if (line === "instructions:" || line === "validation:") listKey = line.slice(0, -1);
			else if (!line.endsWith(":")) listKey = "";
			continue;
		}
		if (line.startsWith("- ") && (listKey === "instructions" || listKey === "validation"))
			rules[listKey].push(cleanYamlScalar(line.slice(2)));
	}
	return rules;
}

function parseAgentsConfig(source) {
	const agents = /** @type {any[]} */ ([]);
	let section = "";
	/** @type {any} */
	let current;
	for (const rawLine of source.replace(/\r/g, "").split("\n")) {
		const lineWithoutComment = rawLine.replace(/\s+#.*$/, "");
		if (!lineWithoutComment.trim()) continue;
		const indent = lineWithoutComment.match(/^\s*/)?.[0].length ?? 0;
		const line = lineWithoutComment.trim();
		if (indent === 0) {
			section = line.endsWith(":") ? line.slice(0, -1) : "";
			current = undefined;
			continue;
		}
		if (section !== "agents") continue;
		if (indent === 2 && line.startsWith("- id:")) {
			current = { id: cleanYamlScalar(line.replace(/^- id:\s*/, "")), target: "", enabled: true };
			agents.push(current);
			continue;
		}
		if (!current) continue;
		const field = line.match(/^(target|format):\s*(.*)$/);
		if (field) current[field[1]] = cleanYamlScalar(field[2]);
		const enabled = line.match(/^enabled:\s*(true|false)\s*$/);
		if (enabled) current.enabled = enabled[1] === "true";
	}
	return agents;
}

function renderAgentProjection(agent, rules) {
	return [
		"<!-- generated-from: .stackwarden/agent-rules.yml + .stackwarden/agents.yml -->",
		`# ${rules.title}`,
		"",
		`Target agent: \`${agent.id}\``,
		"",
		"## Operating rules",
		"",
		...(rules.instructions.length > 0
			? rules.instructions.map((rule) => `- ${rule}`)
			: ["- Follow repository governance before changing durable behavior."]),
		"",
		"## Validation",
		"",
		...(rules.validation.length > 0
			? rules.validation.map((command) => `- \`${command}\``)
			: ["- Run the checks declared by repository maintainers."]),
		"<!-- /generated-from: .stackwarden/agent-rules.yml -->",
		"",
	].join("\n");
}

function checkProjectionsCommand(targetPath = ".", options = {}) {
	const root = resolve(targetPath);
	const sourcePath = resolve(root, ".stackwarden/projections.yml");
	const violations = [];
	if (!existsSync(sourcePath)) violations.push("missing projection source: .stackwarden/projections.yml");
	const projections = existsSync(sourcePath) ? parseProjectionRegistry(readFileSync(sourcePath, "utf8")) : [];
	for (const projection of projections) {
		for (const key of ["id", "source", "generator", "checker"])
			if (!projection[key]) violations.push(`projection ${projection.id || "<unknown>"} missing ${key}`);
		if (!projection.targets?.length) violations.push(`projection ${projection.id || "<unknown>"} missing targets`);
		if (projection.source && !existsSync(resolve(root, projection.source)))
			violations.push(`projection ${projection.id} source does not exist: ${projection.source}`);
		for (const target of projection.targets ?? []) {
			const targetPath = resolve(root, target);
			if (!existsSync(targetPath)) continue;
			const body = readFileSync(targetPath, "utf8").slice(0, 1000);
			if (/\.(md|mdc|txt|ya?ml|json)$/i.test(target) && !body.includes("generated-from:"))
				violations.push(`projection ${projection.id} target missing generated-from marker: ${target}`);
		}
	}
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: "projections",
		blocking: Boolean(options.strict && violations.length > 0),
		wouldBlockIfStrict: violations.length > 0,
		enforcement: options.enforcement ?? (options.strict ? "strict" : "advisory"),
		status: violations.length > 0 ? "failed" : "passed",
		violations,
		warnings: [],
		projections,
	};
}

function parseProjectionRegistry(source) {
	const projections = /** @type {any[]} */ ([]);
	let section = "";
	let listKey = "";
	/** @type {any} */
	let current;
	for (const rawLine of source.replace(/\r/g, "").split("\n")) {
		const lineWithoutComment = rawLine.replace(/\s+#.*$/, "");
		if (!lineWithoutComment.trim()) continue;
		const indent = lineWithoutComment.match(/^\s*/)?.[0].length ?? 0;
		const line = lineWithoutComment.trim();
		if (indent === 0) {
			section = line.endsWith(":") ? line.slice(0, -1) : "";
			current = undefined;
			listKey = "";
			continue;
		}
		if (section !== "projections") continue;
		if (indent === 2 && line.startsWith("- id:")) {
			current = { id: cleanYamlScalar(line.replace(/^- id:\s*/, "")), additionalSources: [], targets: [] };
			projections.push(current);
			listKey = "";
			continue;
		}
		if (!current) continue;
		const scalar = line.match(/^(source|generator|checker):\s*(.*)$/);
		if (scalar) {
			current[scalar[1]] = cleanYamlScalar(scalar[2]);
			listKey = "";
			continue;
		}
		if (line === "targets:" || line === "additionalSources:") {
			listKey = line.slice(0, -1);
			continue;
		}
		if (line.startsWith("- ") && listKey) current[listKey].push(cleanYamlScalar(line.slice(2)));
	}
	return projections;
}

export function runGovernance(mode = "status", targetPath = ".", options = {}) {
	if (mode === "status") return governanceStatusCommand(targetPath, options);
	if (mode === "diff") return governanceDiffCommand(targetPath, options);
	return unknownCommandResult("governance", mode, options);
}

function governanceStatusCommand(targetPath = ".", options = {}) {
	const checks = ["projections", "agents", "codeowners", "workspaces", "pipeline", "local-bypass"].map((name) =>
		runCheck(name, targetPath, options),
	);
	const violations = checks.flatMap((check) => check.violations ?? []);
	const warnings = checks.flatMap((check) => check.warnings ?? []);
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		command: "governance",
		mode: "status",
		blocking: Boolean(options.strict && violations.length > 0),
		status: violations.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
		violations,
		warnings,
		checks: checks.map((check) => ({
			check: check.check,
			status: check.status,
			violations: check.violations?.length ?? 0,
			warnings: check.warnings?.length ?? 0,
		})),
	};
}

function governanceDiffCommand(targetPath = ".", options = {}) {
	const root = resolve(targetPath);
	const diffs = [];
	const codeowners = evaluateCodeowners(root);
	if (
		!codeowners.violations.some((violation) => violation.startsWith("missing ownership source")) &&
		codeowners.current !== codeowners.expected
	) {
		diffs.push(buildTextDiff(codeowners.target, codeowners.current, codeowners.expected));
	}
	for (const result of [evaluateWorkspaces(root), evaluateAgents(root)]) {
		if ((result.violations ?? []).length > 0) continue;
		for (const [file, expected] of result.outputs ?? []) {
			const current = existsSync(file) ? readFileSync(file, "utf8") : "";
			if (current !== expected)
				diffs.push(buildTextDiff(normalizePath(file.slice(root.length + 1)), current, expected));
		}
	}
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		command: "governance",
		mode: "diff",
		blocking: Boolean(options.strict && diffs.length > 0),
		status: diffs.length > 0 ? "diff" : "passed",
		violations: options.strict && diffs.length > 0 ? ["governance projections are stale"] : [],
		warnings: diffs.length > 0 ? ["governance projections differ from generated output"] : [],
		diffs,
	};
}

function buildTextDiff(file, current, expected) {
	return {
		file,
		currentHash: stableHash(current),
		expectedHash: stableHash(expected),
		currentPreview: current.split("\n").slice(0, 12),
		expectedPreview: expected.split("\n").slice(0, 12),
	};
}

function stableHash(value) {
	let hash = 5381;
	for (const char of value) hash = (hash * 33) ^ char.charCodeAt(0);
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function printGovernanceResult(result) {
	console.log(color.bold(`StackWarden governance ${result.mode}: ${result.status}`));
	for (const check of result.checks ?? [])
		console.log(`- ${check.check}: ${check.status} (${check.violations} violation(s))`);
	for (const diff of result.diffs ?? []) console.log(`- ${diff.file}: ${diff.currentHash} -> ${diff.expectedHash}`);
	for (const violation of result.violations ?? []) console.error(`- ${violation}`);
	for (const warning of result.warnings ?? []) console.warn(`- ${warning}`);
}

function checkLocalBypassCommand(targetPath = ".", options = {}) {
	const root = resolve(targetPath);
	const files = listFiles(root, 3000).map(normalizePath);
	const suspiciousFiles = files.filter((file) =>
		/(^|\/)scripts\/(generate-codeowners|generate-workspace-readmes|affected-domains|run-affected|change-classifier)\.(t|j)s$/.test(
			file,
		),
	);
	const packageJson = readJsonIfExists(join(root, "package.json")) ?? {};
	const scripts = packageJson.scripts ?? {};
	const suspiciousScripts = Object.entries(scripts)
		.filter(([, command]) =>
			/scripts\/(generate-codeowners|generate-workspace-readmes|affected-domains|run-affected|change-classifier)\.(t|j)s/.test(
				String(command),
			),
		)
		.map(([name, command]) => `${name}: ${command}`);
	const violations = [
		...suspiciousFiles.map((file) => `local governance bypass script exists: ${file}`),
		...suspiciousScripts.map((script) => `package script bypasses StackWarden: ${script}`),
	];
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: "local-bypass",
		blocking: Boolean(options.strict && violations.length > 0),
		wouldBlockIfStrict: violations.length > 0,
		enforcement: options.enforcement ?? (options.strict ? "strict" : "advisory"),
		status: violations.length > 0 ? "failed" : "passed",
		violations,
		warnings: [],
		suspiciousFiles,
		suspiciousScripts,
	};
}

function checkGovernanceCommand(targetPath = ".", options = {}) {
	const checks = ["projections", "agents", "codeowners", "workspaces", "pipeline", "local-bypass"].map((name) =>
		runCheck(name, targetPath, options),
	);
	const violations = checks.flatMap((check) => check.violations ?? []);
	const warnings = checks.flatMap((check) => check.warnings ?? []);
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: "governance",
		blocking: Boolean(options.strict && violations.length > 0),
		wouldBlockIfStrict: violations.length > 0,
		enforcement: options.enforcement ?? (options.strict ? "strict" : "advisory"),
		status: violations.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
		violations,
		warnings,
		checks,
	};
}

function checkPipelineCommand(targetPath = ".", options = {}) {
	const violations = [];
	let config;
	try {
		config = loadStackwardenPipelineConfig(resolve(targetPath));
	} catch (error) {
		violations.push(error instanceof Error ? error.message : String(error));
	}
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: "pipeline",
		blocking: Boolean(options.strict && violations.length > 0),
		wouldBlockIfStrict: violations.length > 0,
		enforcement: options.enforcement ?? (options.strict ? "strict" : "advisory"),
		status: violations.length > 0 ? "failed" : "passed",
		violations,
		warnings: [],
		config,
	};
}

function runAffected(mode = "verify", targetPath = ".", options = { json: false, dryRun: false }) {
	if (!["checks", "tests", "builds", "verify"].includes(mode)) return unknownCommandResult("affected", mode, options);
	const root = resolve(targetPath);
	const config = loadStackwardenPipelineConfig(root);
	const files = changedFiles(root, options.base ?? config.defaults.baseRef);
	const plan = planAffectedFiles(files, config);
	const commands =
		mode === "checks"
			? plan.checks
			: mode === "tests"
				? plan.tests
				: mode === "builds"
					? plan.builds
					: [...plan.checks, ...plan.tests, ...plan.builds];
	const executed = [];
	const full = process.env.RUN_FULL_GATES === "1";
	const fullCommands =
		mode === "builds"
			? config.defaults.fullBuilds
			: mode === "tests"
				? config.defaults.fullTests
				: [...config.defaults.fullChecks, ...config.defaults.fullTests, ...config.defaults.fullBuilds];
	const selectedCommands = full ? fullCommands : commands;
	for (const command of selectedCommands) {
		executed.push(command);
		if (options.dryRun) continue;
		const result = spawnSync(command, { cwd: root, shell: true, stdio: "inherit", env: process.env });
		if (result.status !== 0) {
			return {
				schemaVersion: 1,
				tool: { name: "stackwarden", version: VERSION },
				command: "affected",
				mode,
				blocking: true,
				status: "failed",
				violations: [`affected command failed: ${command}`],
				warnings: [],
				plan,
				executed,
			};
		}
	}
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		command: "affected",
		mode,
		blocking: false,
		status: "passed",
		violations: [],
		warnings: [],
		baseRef: options.base ?? config.defaults.baseRef,
		dryRun: Boolean(options.dryRun),
		full,
		plan,
		executed,
	};
}

function unknownCommandResult(command, name, options = {}) {
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		command,
		name,
		blocking: Boolean(options.strict),
		status: "unknown-command",
		violations: [`Unknown ${command} target: ${name}`],
		warnings: [],
	};
}

function generateCodeownersCommand(targetPath = ".", options = {}) {
	const root = resolve(targetPath);
	const result = evaluateCodeowners(root);
	if (result.violations.length > 0) return result;
	if (options.write === false) return result;
	mkdirSync(dirname(result.targetPath), { recursive: true });
	writeFileSync(result.targetPath, result.expected);
	return { ...result, status: "generated", changed: result.current !== result.expected };
}

function checkCodeownersCommand(targetPath = ".", options = {}) {
	const result = evaluateCodeowners(resolve(targetPath));
	const stale = result.violations.length === 0 && result.current !== result.expected;
	const violations = [
		...result.violations,
		...(stale ? [`${result.target} is stale. Run stackwarden generate codeowners.`] : []),
	];
	return {
		...result,
		blocking: Boolean(options.strict && violations.length > 0),
		wouldBlockIfStrict: violations.length > 0,
		enforcement: options.enforcement ?? (options.strict ? "strict" : "advisory"),
		status: violations.length > 0 ? "failed" : "passed",
		violations,
	};
}

function evaluateCodeowners(root) {
	const sourcePath = resolve(root, ".stackwarden/ownership.yml");
	const violations = [];
	if (!existsSync(sourcePath)) violations.push("missing ownership source: .stackwarden/ownership.yml");
	const config = existsSync(sourcePath)
		? parseOwnershipConfig(readFileSync(sourcePath, "utf8"))
		: defaultOwnershipConfig();
	violations.push(...validateOwnershipWorkspaceCoverage(root, config));
	const target = config.generatedTarget ?? ".github/CODEOWNERS";
	const targetPath = resolve(root, target);
	const expected = renderCodeowners(config);
	const current = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
	if (!existsSync(targetPath)) violations.push(`missing generated CODEOWNERS target: ${target}`);
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: "codeowners",
		blocking: false,
		status: violations.length > 0 ? "failed" : "passed",
		violations,
		warnings: [],
		source: ".stackwarden/ownership.yml",
		target,
		targetPath,
		expected,
		current,
	};
}

/** @returns {any} */
function defaultOwnershipConfig() {
	return {
		generatedTarget: ".github/CODEOWNERS",
		ownerSets: {},
		workspaceRegistry: {
			source: "package.json",
			requirePackageJsonCoverage: true,
			emitCodeownersRules: false,
			workspaces: [],
		},
		sections: [],
	};
}

function parseOwnershipConfig(source) {
	const config = /** @type {any} */ (defaultOwnershipConfig());
	let section = "";
	let workspaceList = false;
	/** @type {any} */
	let currentWorkspace;
	/** @type {any} */
	let currentCodeownersSection;
	/** @type {any} */
	let currentRule;
	let currentOwnerSet = "";
	let listKey = "";
	for (const rawLine of source.replace(/\r/g, "").split("\n")) {
		const lineWithoutComment = rawLine.replace(/\s+#.*$/, "");
		if (!lineWithoutComment.trim()) continue;
		const indent = lineWithoutComment.match(/^\s*/)?.[0].length ?? 0;
		const line = lineWithoutComment.trim();
		if (indent === 0) {
			const topKey = line.match(/^(\w+):\s*(.*)$/);
			if (topKey) {
				section = topKey[1];
				workspaceList = false;
				currentWorkspace = undefined;
				currentCodeownersSection = undefined;
				currentRule = undefined;
				listKey = "";
				if (topKey[1] === "generatedTarget") config.generatedTarget = cleanYamlScalar(topKey[2]);
			}
			continue;
		}
		if (section === "ownerSets") {
			if (indent === 2 && line.endsWith(":")) {
				currentOwnerSet = line.slice(0, -1);
				config.ownerSets[currentOwnerSet] = [];
				listKey = "ownerSet";
				continue;
			}
			if (line.startsWith("- ") && listKey === "ownerSet" && currentOwnerSet)
				config.ownerSets[currentOwnerSet].push(cleanYamlScalar(line.slice(2)));
			continue;
		}
		if (section === "workspaceRegistry") {
			const scalar = line.match(/^(source|requirePackageJsonCoverage|emitCodeownersRules):\s*(.*)$/);
			if (scalar) {
				const [, key, value] = scalar;
				if (key === "source") config.workspaceRegistry.source = cleanYamlScalar(value);
				if (key === "requirePackageJsonCoverage")
					config.workspaceRegistry.requirePackageJsonCoverage = value.trim() === "true";
				if (key === "emitCodeownersRules") config.workspaceRegistry.emitCodeownersRules = value.trim() === "true";
				continue;
			}
			if (line === "workspaces:") {
				workspaceList = true;
				continue;
			}
			if (workspaceList && line.startsWith("- path:")) {
				currentWorkspace = { path: cleanYamlScalar(line.replace(/^- path:\s*/, "")), owners: [] };
				config.workspaceRegistry.workspaces.push(currentWorkspace);
				listKey = "";
				continue;
			}
			if (workspaceList && line === "owners:") {
				listKey = "workspaceOwners";
				continue;
			}
			if (workspaceList && line.startsWith("- ") && listKey === "workspaceOwners" && currentWorkspace)
				currentWorkspace.owners.push(cleanYamlScalar(line.slice(2)));
			continue;
		}
		if (section === "sections") {
			if (indent === 2 && line.startsWith("- title:")) {
				currentCodeownersSection = { title: cleanYamlScalar(line.replace(/^- title:\s*/, "")), rules: [] };
				config.sections.push(currentCodeownersSection);
				currentRule = undefined;
				listKey = "";
				continue;
			}
			const sectionOwnerSet = line.match(/^ownerSet:\s*(.*)$/);
			if (sectionOwnerSet && currentCodeownersSection && !currentRule) {
				currentCodeownersSection.ownerSet = cleanYamlScalar(sectionOwnerSet[1]);
				continue;
			}
			if (line === "rules:") continue;
			if (line.startsWith("- path:")) {
				currentRule = { path: cleanYamlScalar(line.replace(/^- path:\s*/, "")), owners: [] };
				currentCodeownersSection?.rules.push(currentRule);
				listKey = "";
				continue;
			}
			const ruleOwnerSet = line.match(/^ownerSet:\s*(.*)$/);
			if (ruleOwnerSet && currentRule) {
				currentRule.ownerSet = cleanYamlScalar(ruleOwnerSet[1]);
				continue;
			}
			const owners = line.match(/^owners:\s*(.*)$/);
			if (owners && currentRule) {
				const inlineOwners = parseInlineYamlArray(owners[1]);
				if (inlineOwners.length > 0) currentRule.owners = inlineOwners;
				else listKey = "ruleOwners";
				continue;
			}
			if (line.startsWith("- ") && listKey === "ruleOwners" && currentRule)
				currentRule.owners.push(cleanYamlScalar(line.slice(2)));
		}
	}
	for (const codeownersSection of config.sections) {
		for (const rule of codeownersSection.rules) {
			const ownerSet = rule.ownerSet ?? codeownersSection.ownerSet;
			if (rule.owners.length === 0 && ownerSet) rule.owners = config.ownerSets[ownerSet] ?? [];
		}
	}
	return config;
}

function validateOwnershipWorkspaceCoverage(root, config) {
	if (!config.workspaceRegistry.requirePackageJsonCoverage) return [];
	const packageWorkspaces = loadPackageWorkspaces(root, config.workspaceRegistry.source);
	const declared = new Set(config.workspaceRegistry.workspaces.map((workspace) => workspace.path));
	const violations = [];
	for (const workspace of packageWorkspaces)
		if (!declared.has(workspace))
			violations.push(`package.json workspace missing from .stackwarden/ownership.yml: ${workspace}`);
	for (const workspace of declared)
		if (!packageWorkspaces.includes(workspace))
			violations.push(`.stackwarden/ownership.yml workspace not found in package.json: ${workspace}`);
	return violations;
}

function renderCodeowners(config) {
	const lines = [
		"# generated-from: .stackwarden/ownership.yml",
		"# Do not edit manually. Run: bun run codeowners:generate",
		"#",
		"# CODEOWNERS is intentionally scoped to privileged CI/CD, secret, deploy, and",
		"# infrastructure surfaces. Normal product/code/docs PRs should not require",
		"# privileged approval solely because of a repository-wide wildcard.",
		"#",
		"# GitHub uses the last matching CODEOWNERS rule. Keep privileged rules explicit.",
		"",
	];
	if (config.workspaceRegistry.requirePackageJsonCoverage) {
		lines.push(
			"# Workspace coverage is checked against package.json from .stackwarden/ownership.yml.",
			"# Workspace rules are not emitted unless workspaceRegistry.emitCodeownersRules is true.",
			"",
		);
	}
	for (const section of config.sections) {
		lines.push(`# ${section.title}`);
		for (const rule of section.rules) lines.push(`${rule.path} ${rule.owners.join(" ")}`);
		lines.push("");
	}
	if (config.workspaceRegistry.emitCodeownersRules) {
		lines.push("# Package workspaces.");
		for (const workspace of config.workspaceRegistry.workspaces)
			lines.push(`${workspace.path}/ ${workspace.owners.join(" ")}`);
		lines.push("");
	}
	return `${lines.join("\n").trimEnd()}\n`;
}

function generateWorkspacesCommand(targetPath = ".", _options = {}) {
	const root = resolve(targetPath);
	const result = evaluateWorkspaces(root);
	if (result.violations.length > 0) return result;
	for (const [file, content] of result.outputs) {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content);
	}
	return { ...result, status: "generated", changed: result.stale.length > 0 };
}

function checkWorkspacesCommand(targetPath = ".", options = {}) {
	const result = evaluateWorkspaces(resolve(targetPath));
	const violations = [
		...result.violations,
		...result.stale.map((file) => `${file} is stale. Run stackwarden generate workspaces.`),
	];
	return {
		...result,
		blocking: Boolean(options.strict && violations.length > 0),
		wouldBlockIfStrict: violations.length > 0,
		enforcement: options.enforcement ?? (options.strict ? "strict" : "advisory"),
		status: violations.length > 0 ? "failed" : "passed",
		violations,
	};
}

function evaluateWorkspaces(root) {
	const sourcePath = resolve(root, ".stackwarden/workspaces.yml");
	const violations = [];
	if (!existsSync(sourcePath)) violations.push("missing workspace source: .stackwarden/workspaces.yml");
	const registry = existsSync(sourcePath)
		? parseWorkspaceRegistry(readFileSync(sourcePath, "utf8"))
		: { generatedTargets: { rootReadme: "README.md", workspaceReadme: "README.md" }, workspaces: [] };
	violations.push(...validateWorkspaceRegistry(root, registry));
	const outputs = generateWorkspaceReadmeOutputs(root, registry);
	const stale = [];
	for (const [file, expected] of outputs) {
		if (!existsSync(file) || readFileSync(file, "utf8") !== expected)
			stale.push(normalizePath(file.slice(root.length + 1)));
	}
	return {
		schemaVersion: 1,
		tool: { name: "stackwarden", version: VERSION },
		check: "workspaces",
		blocking: false,
		status: violations.length > 0 ? "failed" : stale.length > 0 ? "stale" : "passed",
		violations,
		warnings: [],
		source: ".stackwarden/workspaces.yml",
		stale,
		outputs,
	};
}

/** @returns {any} */
function parseWorkspaceRegistry(source) {
	const registry = /** @type {any} */ ({
		generatedTargets: { rootReadme: "README.md", workspaceReadme: "README.md" },
		workspaces: [],
	});
	let section = "";
	let current;
	let inCommands = false;
	for (const rawLine of source.replace(/\r/g, "").split("\n")) {
		const lineWithoutComment = rawLine.replace(/\s+#.*$/, "");
		if (!lineWithoutComment.trim()) continue;
		const indent = lineWithoutComment.match(/^\s*/)?.[0].length ?? 0;
		const line = lineWithoutComment.trim();
		if (indent === 0) {
			section = line.endsWith(":") ? line.slice(0, -1) : "";
			current = undefined;
			inCommands = false;
			continue;
		}
		if (section === "generatedTargets") {
			const match = line.match(/^(rootReadme|workspaceReadme):\s*(.*)$/);
			if (match) registry.generatedTargets[match[1]] = cleanYamlScalar(match[2]);
			continue;
		}
		if (section === "workspaces") {
			if (indent === 2 && line.startsWith("- path:")) {
				current = {
					path: cleanYamlScalar(line.replace(/^- path:\s*/, "")),
					package: "",
					domain: "",
					layer: "",
					sensitivity: "",
					description: "",
					commands: {},
				};
				registry.workspaces.push(current);
				inCommands = false;
				continue;
			}
			if (!current) continue;
			if (indent === 4 && line === "commands: {}") {
				current.commands = {};
				inCommands = false;
				continue;
			}
			if (indent === 4 && line === "commands:") {
				inCommands = true;
				continue;
			}
			if (inCommands && indent === 6) {
				const command = line.match(/^(\w[\w:-]*):\s*(.*)$/);
				if (command) current.commands[command[1]] = cleanYamlScalar(command[2]);
				continue;
			}
			const field = line.match(/^(package|domain|layer|sensitivity|description):\s*(.*)$/);
			if (field) {
				current[field[1]] = cleanYamlScalar(field[2]);
				inCommands = false;
			}
		}
	}
	return registry;
}

function validateWorkspaceRegistry(root, registry) {
	const packageWorkspaceSet = new Set(loadPackageWorkspaces(root, "package.json"));
	const declared = new Set(registry.workspaces.map((workspace) => workspace.path));
	const violations = [];
	for (const workspace of packageWorkspaceSet)
		if (!declared.has(workspace))
			violations.push(`package.json workspace missing from .stackwarden/workspaces.yml: ${workspace}`);
	for (const workspace of registry.workspaces) {
		if (!packageWorkspaceSet.has(workspace.path))
			violations.push(`.stackwarden/workspaces.yml workspace not found in package.json: ${workspace.path}`);
		if (!existsSync(resolve(root, workspace.path))) violations.push(`workspace path does not exist: ${workspace.path}`);
		if (existsSync(resolve(root, workspace.path, "package.json"))) {
			const pkg = JSON.parse(readFileSync(resolve(root, workspace.path, "package.json"), "utf8"));
			if (pkg.name && pkg.name !== workspace.package)
				violations.push(
					`${workspace.path} package name mismatch: package.json=${pkg.name}, registry=${workspace.package}`,
				);
		}
	}
	return violations;
}

function generateWorkspaceReadmeOutputs(root, registry) {
	const outputs = new Map();
	const rootReadme = resolve(root, registry.generatedTargets.rootReadme);
	const rootCurrent = existsSync(rootReadme) ? readFileSync(rootReadme, "utf8") : "# Repository\n";
	outputs.set(rootReadme, mergeGeneratedSection(rootCurrent, renderRootWorkspaceSection(registry), "Repository"));
	for (const workspace of registry.workspaces) {
		const readme = resolve(root, workspace.path, registry.generatedTargets.workspaceReadme);
		const current = existsSync(readme) ? readFileSync(readme, "utf8") : `# ${workspace.package || workspace.path}\n`;
		outputs.set(
			readme,
			mergeGeneratedSection(current, renderWorkspaceReadmeSection(workspace), workspace.package || workspace.path),
		);
	}
	return outputs;
}

function renderRootWorkspaceSection(registry) {
	const rows = registry.workspaces
		.map(
			(workspace) =>
				`| \`${workspace.path}\` | \`${workspace.package}\` | ${workspace.domain} | ${workspace.layer} | ${workspace.sensitivity} |`,
		)
		.join("\n");
	return [
		"<!-- generated-from: .stackwarden/workspaces.yml -->",
		"## Workspace registry",
		"",
		"This section is generated from `.stackwarden/workspaces.yml`. Do not edit it manually.",
		"",
		"| Workspace | Package | Domain | Layer | Sensitivity |",
		"| --- | --- | --- | --- | --- |",
		rows,
		"<!-- /generated-from: .stackwarden/workspaces.yml -->",
	].join("\n");
}

function renderWorkspaceReadmeSection(workspace) {
	return [
		"<!-- generated-from: .stackwarden/workspaces.yml -->",
		"## Workspace governance",
		"",
		"This section is generated from the root `.stackwarden/workspaces.yml`. Do not edit it manually.",
		"",
		`- Path: \`${workspace.path}\``,
		`- Package: \`${workspace.package}\``,
		`- Domain: ${workspace.domain}`,
		`- Hexagonal layer: ${workspace.layer}`,
		`- Sensitivity: ${workspace.sensitivity}`,
		`- Purpose: ${workspace.description}`,
		"",
		"### Root validation commands",
		"",
		commandList(workspace.commands),
		"<!-- /generated-from: .stackwarden/workspaces.yml -->",
	].join("\n");
}

function mergeGeneratedSection(current, generated, fallbackTitle) {
	const start = "<!-- generated-from: .stackwarden/workspaces.yml -->";
	const end = "<!-- /generated-from: .stackwarden/workspaces.yml -->";
	if (current.includes(start) && current.includes(end)) {
		const before = current.slice(0, current.indexOf(start)).trimEnd();
		const after = current.slice(current.indexOf(end) + end.length).trimStart();
		return `${before}\n\n${generated}\n${after ? `\n${after}` : ""}`;
	}
	const prefix = current.trim().length > 0 ? current.trimEnd() : `# ${fallbackTitle}`;
	return `${prefix}\n\n${generated}\n`;
}

function commandList(commands) {
	const entries = Object.entries(commands ?? {});
	if (entries.length === 0) return "- No root command registered yet.";
	return entries.map(([name, command]) => `- ${name}: \`${command}\``).join("\n");
}

function loadStackwardenPipelineConfig(root) {
	const sourcePath = resolve(root, ".stackwarden/pipeline.yml");
	if (!existsSync(sourcePath)) throw new Error("missing pipeline source: .stackwarden/pipeline.yml");
	return parsePipelineYaml(readFileSync(sourcePath, "utf8"));
}

function emptyDomainConfig() {
	return { roots: [], files: [], extensions: [], tests: [], builds: [], checks: [] };
}

/** @returns {any} */
function parsePipelineYaml(source) {
	const config = /** @type {any} */ ({
		defaults: {
			baseRef: "origin/main",
			failClosedOnUnknownPath: true,
			alwaysChecks: [],
			fullChecks: ["bun run lint:ci"],
			fullTests: ["bun run test:all"],
			fullBuilds: ["bun run build"],
		},
		domains: {},
		fullValidation: { paths: [], domains: [] },
		unknownPath: { domains: [] },
	});
	let section = "";
	let domainName = "";
	let listKey = "";
	let inFullValidation = false;
	let inUnknownPath = false;
	for (const rawLine of source.replace(/\r/g, "").split("\n")) {
		const withoutComment = rawLine.replace(/\s+#.*$/, "");
		if (!withoutComment.trim()) continue;
		const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0;
		const line = withoutComment.trim();
		if (indent === 0) {
			section = line.endsWith(":") ? line.slice(0, -1) : "";
			domainName = "";
			listKey = "";
			inFullValidation = false;
			inUnknownPath = false;
			continue;
		}
		if (section === "defaults") {
			const match = line.match(/^(\w+):\s*(.*)$/);
			if (match) {
				const [, key, value] = match;
				if (value === "") listKey = key;
				else config.defaults[key] = parseYamlScalar(value);
				continue;
			}
			if (line.startsWith("- ") && listKey) config.defaults[listKey].push(cleanYamlScalar(line.slice(2)));
			continue;
		}
		if (section === "domains") {
			if (indent === 2 && line.endsWith(":")) {
				domainName = line.slice(0, -1);
				config.domains[domainName] = emptyDomainConfig();
				listKey = "";
				continue;
			}
			const domain = config.domains[domainName];
			if (!domain) continue;
			const keyMatch = line.match(/^(roots|files|extensions|tests|checks|builds):\s*(.*)$/);
			if (keyMatch) {
				const [, key, value] = keyMatch;
				listKey = key;
				if (value === "[]") domain[key] = [];
				continue;
			}
			if (line.startsWith("- ") && listKey) domain[listKey].push(cleanYamlScalar(line.slice(2)));
			continue;
		}
		if (section === "rules") {
			if (indent === 2 && line === "fullValidation:") {
				inFullValidation = true;
				inUnknownPath = false;
				listKey = "";
				continue;
			}
			if (indent === 2 && line === "unknownPath:") {
				inFullValidation = false;
				inUnknownPath = true;
				listKey = "";
				continue;
			}
			const keyMatch = line.match(/^(paths|domains):\s*(.*)$/);
			if (keyMatch) {
				listKey = keyMatch[1];
				continue;
			}
			if (line.startsWith("- ")) {
				const value = cleanYamlScalar(line.slice(2));
				if (inFullValidation && listKey === "paths") config.fullValidation.paths.push(value);
				if (inFullValidation && listKey === "domains") config.fullValidation.domains.push(value);
				if (inUnknownPath && listKey === "domains") config.unknownPath.domains.push(value);
			}
		}
	}
	return config;
}

function classifyAffectedPath(file, config) {
	const normalized = normalizePath(file);
	if (config.fullValidation.paths.includes(normalized))
		return { domains: config.fullValidation.domains, fullRequired: true, reason: `root config changed: ${normalized}` };
	for (const [domain, domainConfig] of Object.entries(config.domains)) {
		if (domainConfig.files.includes(normalized)) return { domains: [domain] };
		if (domainConfig.roots.some((root) => normalized.startsWith(root))) return { domains: [domain] };
		if (domainConfig.extensions.some((extension) => normalized.endsWith(extension))) return { domains: [domain] };
	}
	return {
		domains: config.unknownPath.domains,
		fullRequired: config.defaults.failClosedOnUnknownPath,
		reason: `unclassified path: ${normalized}`,
	};
}

function planAffectedFiles(files, config) {
	const domains = new Set();
	const reasons = [];
	let fullRequired = false;
	for (const file of files.filter(Boolean)) {
		const classification = classifyAffectedPath(file, config);
		for (const domain of classification.domains) domains.add(domain);
		if (classification.fullRequired) fullRequired = true;
		if (classification.reason) reasons.push(classification.reason);
	}
	const ordered = Object.keys(config.domains).filter((domain) => domains.has(domain));
	const commands = ordered.map((domain) => config.domains[domain]);
	return {
		files,
		domains: ordered,
		fullRequired,
		reasons,
		tests: uniq(commands.flatMap((command) => command.tests)),
		builds: uniq(commands.flatMap((command) => command.builds)),
		checks: uniq([...(config.defaults.alwaysChecks ?? []), ...commands.flatMap((command) => command.checks)]),
	};
}

function changedFiles(root, baseRef) {
	const mergeBase = spawnSync("git", ["merge-base", baseRef, "HEAD"], { cwd: root, encoding: "utf8" });
	if (mergeBase.status !== 0)
		throw new Error(`Unable to compute merge-base with ${baseRef}: ${mergeBase.stderr.trim()}`);
	const base = mergeBase.stdout.trim();
	const diff = spawnSync("git", ["diff", "--name-only", "--diff-filter=d", base], { cwd: root, encoding: "utf8" });
	if (diff.status !== 0) throw new Error(`Unable to compute changed files: ${diff.stderr.trim()}`);
	return diff.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function loadPackageWorkspaces(root, sourcePath) {
	const packagePath = resolve(root, sourcePath);
	if (!existsSync(packagePath)) return [];
	const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
	const workspaces = packageJson.workspaces;
	if (Array.isArray(workspaces)) return expandWorkspacePatterns(root, workspaces);
	if (Array.isArray(workspaces?.packages)) return expandWorkspacePatterns(root, workspaces.packages);
	return [];
}

function expandWorkspacePatterns(root, patterns) {
	const paths = [];
	for (const pattern of patterns) {
		if (!pattern.includes("*")) {
			paths.push(normalizePath(pattern));
			continue;
		}
		const base = pattern.slice(0, pattern.indexOf("*")).replace(/\/$/, "");
		const basePath = resolve(root, base);
		if (!existsSync(basePath)) continue;
		for (const entry of readdirSync(basePath, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const workspacePath = normalizePath(`${base}/${entry.name}`);
			if (matchesWorkspacePattern(workspacePath, pattern) && existsSync(resolve(root, workspacePath, "package.json")))
				paths.push(workspacePath);
		}
	}
	return uniq(paths).sort();
}

function matchesWorkspacePattern(workspacePath, pattern) {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+");
	return new RegExp(`^${escaped}$`).test(workspacePath);
}

function parseInlineYamlArray(value) {
	const trimmed = value.trim();
	if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
	return trimmed
		.slice(1, -1)
		.split(",")
		.map((item) => cleanYamlScalar(item))
		.filter(Boolean);
}

function parseYamlScalar(value) {
	const trimmed = value.trim();
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (/^\d+$/.test(trimmed)) return Number(trimmed);
	if (trimmed === "[]") return [];
	return cleanYamlScalar(trimmed);
}

function cleanYamlScalar(value) {
	return String(value)
		.trim()
		.replace(/^["']|["']$/g, "");
}

function uniq(items) {
	return [...new Set(items)];
}

function printGenerateResult(result) {
	if (result.status === "generated") {
		console.log(color.green(`Generated ${result.check}.`));
		return;
	}
	printCheckResult(result);
}

function printAffectedResult(result) {
	if (result.status !== "passed") {
		printCheckResult(result);
		return;
	}
	console.log(`Affected domains: ${result.plan.domains.join(", ") || "none"}`);
	if (result.plan.fullRequired) console.log(`Expanded validation reason: ${result.plan.reasons.join("; ")}`);
	if (result.executed.length === 0) console.log(`No affected ${result.mode} commands to run.`);
	for (const command of result.executed) console.log(`${result.dryRun ? "DRY " : ""}$ ${command}`);
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
