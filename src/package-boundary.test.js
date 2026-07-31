import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("package public API can be imported without executing the CLI", async () => {
	const originalExitCode = process.exitCode;
	const publicApi = await import("stackwarden");

	assert.equal(typeof publicApi.auditRepository, "function");
	assert.equal(process.exitCode, originalExitCode);
});

test("installed CLI adapter reports the package version", () => {
	const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));
	const result = spawnSync(process.execPath, [cliPath, "--version"], { encoding: "utf8" });

	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout.trim(), packageJson.version);
});