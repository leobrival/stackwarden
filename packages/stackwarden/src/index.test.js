import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as stackwarden from "./index.js";

test("auditRepository returns deterministic score structure", () => {
	const root = mkdtempSync(join(tmpdir(), "stackwarden-audit-"));
	try {
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				scripts: { lint: "echo lint", typecheck: "echo typecheck", test: "echo test", build: "echo build" },
			}),
		);
		writeFileSync(join(root, ".gitignore"), "node_modules\n.env\n");
		writeFileSync(join(root, "bun.lock"), "");
		writeFileSync(join(root, "biome.json"), "{}\n");
		const report = stackwarden.auditRepository(root, { mode: "fast", json: true, verbose: false });
		assert.equal(report.tool.name, "stackwarden");
		assert.equal(report.metadata.mode, "fast");
		assert.equal(typeof report.scores.global, "number");
		assert.ok(report.scores.byLevel.material);
		assert.ok(Array.isArray(report.findings));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("initRepository is dry-run by default and writes only with write=true", () => {
	const root = mkdtempSync(join(tmpdir(), "stackwarden-init-"));
	try {
		const dryRun = stackwarden.initRepository(root, { write: false, json: true });
		assert.deepEqual(
			dryRun.changes.map((change) => change.action),
			["would-create", "would-create", "would-create", "would-create", "would-create"],
		);
		const written = stackwarden.initRepository(root, { write: true, json: true });
		assert.deepEqual(
			written.changes.map((change) => change.action),
			["created", "created", "created", "created", "created"],
		);
		const secondRun = stackwarden.initRepository(root, { write: true, json: true });
		assert.deepEqual(
			secondRun.changes.map((change) => change.action),
			["skip-existing", "skip-existing", "skip-existing", "skip-existing", "skip-existing"],
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
