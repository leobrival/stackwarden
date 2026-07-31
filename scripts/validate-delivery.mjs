#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DELIVERY_TYPES = [
	"feat",
	"fix",
	"refactor",
	"perf",
	"test",
	"docs",
	"build",
	"ci",
	"chore",
	"revert",
];

const typePattern = DELIVERY_TYPES.join("|");
const conventionalSubject = new RegExp(
	`^(${typePattern})(\\([a-z0-9][a-z0-9./-]*\\))?!?: [a-z0-9][^\\r\\n]*$`,
);
const topicBranch = new RegExp(
	`^(${typePattern})/(?:[0-9]+-)?[a-z0-9]+(?:-[a-z0-9]+)*$`,
);
const exemptBranch = /^(main|release-please--branches--main--components--[a-z0-9-]+|dependabot\/.*|renovate\/.*)$/;

export function validateCommitMessage(message) {
	const subject = message.trimStart().split(/\r?\n/u)[0]?.trimEnd() ?? "";
	const errors = [];

	if (!conventionalSubject.test(subject)) {
		errors.push(
			`Commit subject must match "type(scope): description". Allowed types: ${DELIVERY_TYPES.join(", ")}.`,
		);
	}
	if (subject.length > 100) {
		errors.push("Commit subject must not exceed 100 characters.");
	}

	return errors;
}

export function validateBranchName(branch) {
	const errors = [];

	if (!branch) {
		return ["Branch name is required."];
	}
	if (!exemptBranch.test(branch) && !topicBranch.test(branch)) {
		errors.push(
			`Branch must match "type/short-kebab-description" or "type/123-short-kebab-description". Allowed types: ${DELIVERY_TYPES.join(", ")}.`,
		);
	}
	if (branch.length > 80) {
		errors.push("Branch name must not exceed 80 characters.");
	}

	return errors;
}

function fail(label, value, errors) {
	process.stderr.write(`Invalid ${label}: ${value}\n`);
	for (const error of errors) {
		process.stderr.write(`- ${error}\n`);
	}
	process.exitCode = 1;
}

function validateRange(base, head) {
	const commits = execFileSync("git", ["rev-list", "--reverse", `${base}..${head}`], {
		encoding: "utf8",
	})
		.trim()
		.split("\n")
		.filter(Boolean);

	for (const commit of commits) {
		const message = execFileSync("git", ["show", "-s", "--format=%B", commit], {
			encoding: "utf8",
		});
		const errors = validateCommitMessage(message);
		if (errors.length > 0) {
			fail("commit", `${commit.slice(0, 12)} ${message.split(/\r?\n/u)[0]}`, errors);
		}
	}
}

export function run(argv) {
	const [command, ...args] = argv;

	switch (command) {
		case "branch": {
			const branch = args[0] ?? "";
			const errors = validateBranchName(branch);
			if (errors.length > 0) fail("branch", branch, errors);
			break;
		}
		case "commit-msg": {
			const file = args[0];
			if (!file) throw new Error("commit-msg requires a commit message file");
			const message = readFileSync(file, "utf8");
			const errors = validateCommitMessage(message);
			if (errors.length > 0) fail("commit", message.split(/\r?\n/u)[0], errors);
			break;
		}
		case "pr-title": {
			const title = args.join(" ");
			const errors = validateCommitMessage(title);
			if (errors.length > 0) fail("pull request title", title, errors);
			break;
		}
		case "range": {
			const [base, head] = args;
			if (!base || !head) throw new Error("range requires base and head revisions");
			validateRange(base, head);
			break;
		}
		default:
			throw new Error("Usage: validate-delivery.mjs <branch|commit-msg|pr-title|range> [...args]");
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		run(process.argv.slice(2));
	} catch (error) {
		process.stderr.write(`${error.message}\n`);
		process.exitCode = 1;
	}
}
