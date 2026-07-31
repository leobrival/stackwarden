#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_PATH = resolve(ROOT, "config/projections.json");
const PACKAGE_PATH = resolve(ROOT, "package.json");

function loadRegistry() {
	return JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
}

function packageScripts() {
	return JSON.parse(readFileSync(PACKAGE_PATH, "utf8")).scripts ?? {};
}

function assertSource(source, policy) {
	const violations = [];
	const sourcePath = resolve(ROOT, source.path);
	const schemaPath = resolve(ROOT, source.schema);
	if (!existsSync(sourcePath)) violations.push(`${source.id}: source does not exist: ${source.path}`);
	if (!existsSync(schemaPath)) violations.push(`${source.id}: schema does not exist: ${source.schema}`);
	if (existsSync(sourcePath) && policy.sourcesMustDeclareSchema) {
		const body = readFileSync(sourcePath, "utf8");
		const schemaReference = source.path.endsWith(".json")
			? JSON.parse(body).$schema
			: body.match(/^\$schema:\s*(.+)$/m)?.[1]?.trim();
		if (schemaReference !== `../${source.schema}`) {
			violations.push(`${source.id}: source $schema must reference ../${source.schema}`);
		}
	}
	return violations;
}

function assertProjection(projection, scripts, policy, registeredSources) {
	const violations = [];
	const sourcePath = resolve(ROOT, projection.source);
	const schemaPath = resolve(ROOT, projection.schema);
	const targetPath = resolve(ROOT, projection.target);
	if (!existsSync(sourcePath)) violations.push(`${projection.id}: source does not exist: ${projection.source}`);
	if (!existsSync(schemaPath)) violations.push(`${projection.id}: schema does not exist: ${projection.schema}`);
	if (!existsSync(targetPath)) violations.push(`${projection.id}: target does not exist: ${projection.target}`);
	if (!registeredSources.has(projection.source)) {
		violations.push(`${projection.id}: projection source is not registered: ${projection.source}`);
	}
	if (!scripts[projection.generator])
		violations.push(`${projection.id}: generator script missing: ${projection.generator}`);
	if (!scripts[projection.checker]) violations.push(`${projection.id}: checker script missing: ${projection.checker}`);
	if (existsSync(sourcePath) && policy.sourcesMustDeclareSchema) {
		const source = JSON.parse(readFileSync(sourcePath, "utf8"));
		if (source.$schema !== `../${projection.schema}`) {
			violations.push(`${projection.id}: source $schema must reference ../${projection.schema}`);
		}
	}
	if (existsSync(targetPath) && policy.generatedDocsMustDeclareSource) {
		const target = readFileSync(targetPath, "utf8").slice(0, 500);
		if (!target.includes(`generated-from: packages/stackwarden/${projection.source}`)) {
			violations.push(`${projection.id}: target must declare generated-from source ${projection.source}`);
		}
	}
	return violations;
}

function unmanagedConfigSources(registeredSources) {
	const candidates = [
		...filesIn("config").filter((file) => file.endsWith(".json")),
		...filesIn("templates").filter((file) => file.endsWith(".yml") || file.endsWith(".yaml")),
	];
	return candidates.filter((file) => !registeredSources.has(file));
}

function filesIn(directory) {
	const root = resolve(ROOT, directory);
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => `${directory}/${entry.name}`);
}

export function checkProjections() {
	const registry = loadRegistry();
	const scripts = packageScripts();
	const registeredSources = new Set(registry.sources.map((source) => source.path));
	const violations = [
		...registry.sources.flatMap((source) => assertSource(source, registry.policy)),
		...registry.projections.flatMap((projection) =>
			assertProjection(projection, scripts, registry.policy, registeredSources),
		),
	];
	if (registry.policy.allConfigSourcesMustBeRegistered) {
		for (const source of unmanagedConfigSources(registeredSources)) {
			violations.push(`unregistered source-of-truth file: ${source}`);
		}
	}
	return violations;
}

function main() {
	const args = new Set(process.argv.slice(2));
	if (args.has("--generate")) {
		for (const projection of loadRegistry().projections) {
			execFileSync("bun", ["run", projection.generator], { cwd: ROOT, stdio: "inherit" });
		}
		return;
	}
	if (args.has("--freshness")) {
		for (const projection of loadRegistry().projections) {
			execFileSync("bun", ["run", projection.checker], { cwd: ROOT, stdio: "inherit" });
		}
	}
	const violations = checkProjections();
	if (violations.length > 0) {
		console.error(`Projection governance violations: ${violations.length}`);
		for (const violation of violations) console.error(`- ${violation}`);
		process.exit(1);
	}
	console.log("Projection governance check passed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
