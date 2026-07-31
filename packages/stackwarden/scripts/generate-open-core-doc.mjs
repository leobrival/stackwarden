#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = resolve(ROOT, "config/open-core-model.json");
const OUTPUT_PATH = resolve(ROOT, "docs/open-core-model.md");

function renderList(items) {
	return items.map((item) => `- ${item}`).join("\n");
}

function renderTierTable(tiers) {
	return [
		"| Tier | Execution | Visibility | Shipped in core package | Purpose |",
		"| --- | --- | --- | --- | --- |",
		...tiers.map(
			(tier) =>
				`| ${tier.name} | ${tier.execution} | ${tier.visibility} | ${tier.includedInPackage ? "yes" : "no"} | ${tier.description} |`,
		),
	].join("\n");
}

function renderExamples(tiers) {
	return tiers.map((tier) => [`### ${tier.name}`, "", renderList(tier.examples)].join("\n")).join("\n\n");
}

function renderConfigFiles(configFiles) {
	return configFiles.map((file) => `- \`${file.path}\` — ${file.purpose}`).join("\n");
}

function renderJsonContract(jsonContract) {
	return `\`\`\`json
${JSON.stringify(jsonContract, null, 2)}
\`\`\``;
}

function renderOnlineVersion(onlineVersion) {
	if (!onlineVersion) return "";
	return `## Public online version

**${onlineVersion.name}** status: \`${onlineVersion.status}\`.

${onlineVersion.purpose}

### Public website must explain

${renderList(onlineVersion.publicWebsite.mustExplain)}

### Public website must not expose

${renderList(onlineVersion.publicWebsite.mustNotExpose)}

### Initial cloud API

| Method | Path | Purpose |
| --- | --- | --- |
${onlineVersion.cloudApi.initialEndpoints.map((endpoint) => `| ${endpoint.method} | \`${endpoint.path}\` | ${endpoint.purpose} |`).join("\n")}

Default privacy contract:

\`\`\`json
${JSON.stringify(onlineVersion.cloudApi.defaultPrivacy, null, 2)}
\`\`\`

Failure mode: \`${onlineVersion.cloudApi.failureMode}\`.

### Free capabilities

${renderList(onlineVersion.freeCapabilities)}

### Paid capabilities

${renderList(onlineVersion.paidCapabilities)}

### Public launch checklist

${renderList(onlineVersion.publicLaunchChecklist)}
`;
}

export function generateOpenCoreDoc(config) {
	return `<!-- generated-from: packages/stackwarden/config/open-core-model.json -->
<!-- Do not edit manually. Run: bun run --filter stackwarden docs:open-core:generate -->

# StackWarden open-core model

This document is generated from \`${config.sourceOfTruth}\`. The config file is the single source of truth for StackWarden's core, licensed, and premium visibility boundaries.

## Principles

${renderList(config.principles)}

## Capability tiers

${renderTierTable(config.tiers)}

## Tier examples

${renderExamples(config.tiers)}

## Local guarantees

${renderList(config.localGuarantees)}

## Configuration files

${renderConfigFiles(config.configFiles)}

${renderOnlineVersion(config.onlineVersion)}
## JSON visibility contract

${renderJsonContract(config.jsonContract)}
`;
}

function main() {
	const args = new Set(process.argv.slice(2));
	const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
	const next = generateOpenCoreDoc(config);
	if (args.has("--check")) {
		const current = readFileSync(OUTPUT_PATH, "utf8");
		if (current !== next) {
			console.error("Open-core model documentation is stale. Run docs:open-core:generate.");
			process.exit(1);
		}
		console.log("Open-core model documentation is fresh.");
		return;
	}
	writeFileSync(OUTPUT_PATH, next);
	console.log(`Generated ${OUTPUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
