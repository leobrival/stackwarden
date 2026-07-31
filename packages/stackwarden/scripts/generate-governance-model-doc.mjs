#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = resolve(ROOT, "config/governance-model.json");
const OUTPUT_PATH = resolve(ROOT, "docs/governance-model.md");

function renderList(items) {
	return items.map((item) => `- ${item}`).join("\n");
}

function renderDomain(domain) {
	return [
		`### ${domain.label}`,
		"",
		`ID: \`${domain.id}\``,
		"",
		"Client files:",
		renderList(domain.clientFiles.map((file) => `\`${file}\``)),
		"",
		"Checks:",
		renderList(domain.checks),
		"",
		"Brick signals:",
		renderList(domain.brickSignals),
	].join("\n");
}

function renderRules(rules) {
	return [
		"| Rule | Domain | Detects | Recommendation |",
		"| --- | --- | --- | --- |",
		...rules.map(
			(rule) => `| \`${rule.id}\` ${rule.title} | ${rule.domain} | ${rule.detects} | ${rule.recommendation} |`,
		),
	].join("\n");
}

function renderVocabulary(vocabulary) {
	return [
		"| Concept | Client-facing term |",
		"| --- | --- |",
		`| Source layer | ${vocabulary.sourceLayer} |`,
		`| Projection layer | ${vocabulary.projectionLayer} |`,
		`| Quality layer | ${vocabulary.qualityLayer} |`,
		`| Agent layer | ${vocabulary.agentLayer} |`,
		`| Private methodology policy | ${vocabulary.privateMethodologyPolicy} |`,
	].join("\n");
}

export function generateGovernanceModelDoc(config) {
	return `<!-- generated-from: packages/stackwarden/config/governance-model.json -->
<!-- Do not edit manually. Run: bun run --filter stackwarden docs:governance-model:generate -->

# StackWarden governance model

This document is generated from \`${config.sourceOfTruth}\`. It defines the client-facing governance vocabulary and deterministic brick-level contracts used by StackWarden.

## Purpose

${config.purpose}

## Principles

${renderList(config.principles)}

## Governance domains

${config.domains.map(renderDomain).join("\n\n")}

## Brick-level governance rules

${renderRules(config.rules)}

## Client vocabulary

${renderVocabulary(config.clientVocabulary)}
`;
}

function main() {
	const args = new Set(process.argv.slice(2));
	const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
	const next = generateGovernanceModelDoc(config);
	if (args.has("--check")) {
		const current = readFileSync(OUTPUT_PATH, "utf8");
		if (current !== next) {
			console.error("Governance model documentation is stale. Run docs:governance-model:generate.");
			process.exit(1);
		}
		console.log("Governance model documentation is fresh.");
		return;
	}
	writeFileSync(OUTPUT_PATH, next);
	console.log(`Generated ${OUTPUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
