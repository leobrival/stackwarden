#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CHECKS = [
	{
		kind: "json",
		file: "config/open-core-model.json",
		schema: "schemas/open-core-model.schema.json",
		required: ["$schema", "schemaVersion", "name", "sourceOfTruth", "generatedDocument", "principles", "tiers"],
	},
	{
		kind: "json",
		file: "config/projections.json",
		schema: "schemas/projections.schema.json",
		required: ["$schema", "schemaVersion", "name", "sourceOfTruth", "policy", "sources", "projections"],
	},
	{
		kind: "json",
		file: "config/business-testing.json",
		schema: "schemas/business-testing.schema.json",
		required: [
			"$schema",
			"schemaVersion",
			"name",
			"sourceOfTruth",
			"methodologySource",
			"generatedDocument",
			"purpose",
			"principles",
			"traceability",
			"rules",
		],
	},
	{
		kind: "json",
		file: "config/public-export.json",
		schema: "schemas/public-export.schema.json",
		required: ["$schema", "outputDirectory", "packageName", "repositoryUrl", "forbiddenPatterns", "files"],
	},
	{
		kind: "json",
		file: "config/governance-model.json",
		schema: "schemas/governance-model.schema.json",
		required: [
			"$schema",
			"schemaVersion",
			"name",
			"sourceOfTruth",
			"generatedDocument",
			"purpose",
			"principles",
			"domains",
			"rules",
			"clientVocabulary",
		],
	},
	{
		kind: "yaml",
		file: "templates/config.yml",
		schema: "schemas/config.schema.json",
		required: ["$schema", "version", "name", "recommendationPolicy", "material", "governance", "continuousImprovement"],
	},
	{
		kind: "yaml",
		file: "templates/capabilities.yml",
		schema: "schemas/capabilities.schema.json",
		required: ["$schema", "version", "name", "access", "capabilities", "policy"],
	},
];

function loadYaml(path) {
	const json = execFileSync("ruby", ["-ryaml", "-rjson", "-e", "puts YAML.load_file(ARGV[0]).to_json", path], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	return JSON.parse(json);
}

function load(root, file, kind) {
	const path = resolve(root, file);
	return kind === "json" ? JSON.parse(readFileSync(path, "utf8")) : loadYaml(path);
}

function assertConfig(check, root) {
	const config = load(root, check.file, check.kind);
	const schemaPath = resolve(root, check.schema);
	const violations = [];
	if (!existsSync(schemaPath)) {
		violations.push(`${check.schema} does not exist`);
		return violations;
	}
	const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
	for (const key of check.required ?? []) {
		if (!(key in config)) violations.push(`${check.file} missing required key ${key}`);
	}
	if (config.$schema !== relativeSchemaPath(check.file, check.schema)) {
		violations.push(`${check.file} $schema must be ${relativeSchemaPath(check.file, check.schema)}`);
	}
	return [...violations, ...validateAgainstSchema(config, schema, check.file)];
}

function validateAgainstSchema(value, schema, path) {
	const violations = [];
	if (schema.const !== undefined && value !== schema.const)
		violations.push(`${path} must equal ${JSON.stringify(schema.const)}`);
	if (schema.enum && !schema.enum.includes(value)) violations.push(`${path} must be one of ${schema.enum.join(", ")}`);
	if (schema.type && !matchesType(value, schema.type)) violations.push(`${path} must be ${schema.type}`);
	if (!value || typeof value !== "object" || Array.isArray(value)) return violations;
	for (const key of schema.required ?? []) {
		if (!(key in value)) violations.push(`${path} missing schema-required key ${key}`);
	}
	if (schema.additionalProperties === false) {
		for (const key of Object.keys(value)) {
			if (!schema.properties?.[key]) violations.push(`${path} has schema-unknown key ${key}`);
		}
	}
	for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
		if (key in value) violations.push(...validateAgainstSchema(value[key], childSchema, `${path}.${key}`));
	}
	return violations;
}

function matchesType(value, type) {
	if (type === "array") return Array.isArray(value);
	if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
	if (type === "number") return typeof value === "number";
	return typeof value === type;
}

function relativeSchemaPath(file, schema) {
	if (file.startsWith("templates/")) return `../${schema}`;
	if (file.startsWith("config/")) return `../${schema}`;
	return schema;
}

export function checkConfigSchemas(options = {}) {
	const root = options.root ?? ROOT;
	const checks = options.checks ?? CHECKS;
	return checks.flatMap((check) => assertConfig(check, root));
}

function main() {
	const violations = checkConfigSchemas();
	if (violations.length > 0) {
		console.error(`Config schema violations: ${violations.length}`);
		for (const violation of violations) console.error(`- ${violation}`);
		process.exit(1);
	}
	console.log(`Config schema check passed for ${CHECKS.length} source file(s).`);
}

const executedFile = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (executedFile) main();
