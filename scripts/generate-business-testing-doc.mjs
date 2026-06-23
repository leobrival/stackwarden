#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = resolve(ROOT, "config/business-testing.json");
const OUTPUT_PATH = resolve(ROOT, "docs/business-testing.md");

function list(items) {
	return items.map((item) => `- ${item}`).join("\n");
}

function traceabilityTable(rows) {
	return [
		"| Business intent | Feature | Executable test |",
		"| --- | --- | --- |",
		...rows.map((row) => `| ${row.businessIntent} | \`${row.feature}\` | ${row.executableTest} |`),
	].join("\n");
}

export function generateBusinessTestingDoc(config) {
	return `<!-- generated-from: packages/stackwarden/config/business-testing.json -->
<!-- Do not edit manually. Run: bun run --filter stackwarden docs:business-testing:generate -->

# StackWarden business testing

Source methodology: \`${config.methodologySource}\`.

${config.purpose}

## Principles

${list(config.principles)}

## Traceability

${traceabilityTable(config.traceability)}

## Rules

${list(config.rules)}
`;
}

function main() {
	const args = new Set(process.argv.slice(2));
	const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
	const next = generateBusinessTestingDoc(config);
	if (args.has("--check")) {
		const current = readFileSync(OUTPUT_PATH, "utf8");
		if (current !== next) {
			console.error("Business-testing documentation is stale. Run docs:business-testing:generate.");
			process.exit(1);
		}
		console.log("Business-testing documentation is fresh.");
		return;
	}
	writeFileSync(OUTPUT_PATH, next);
	console.log(`Generated ${OUTPUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
