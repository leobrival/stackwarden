import assert from "node:assert/strict";
import test from "node:test";

import {
	validateBranchName,
	validateCommitMessage,
} from "./validate-delivery.mjs";

test("accepts Conventional Commit subjects used by Release Please", () => {
	assert.deepEqual(validateCommitMessage("feat(cli): add policy checks\n\nDetails."), []);
	assert.deepEqual(validateCommitMessage("fix!: remove deprecated output"), []);
	assert.deepEqual(validateCommitMessage("chore(main): release 0.3.0"), []);
});

test("rejects non-conventional or overly long commit subjects", () => {
	assert.notDeepEqual(validateCommitMessage("Add policy checks"), []);
	assert.notDeepEqual(validateCommitMessage("feature: add policy checks"), []);
	assert.notDeepEqual(validateCommitMessage(`feat: ${"a".repeat(95)}`), []);
});

test("accepts short-lived TBD branches and automation branches", () => {
	assert.deepEqual(validateBranchName("feat/policy-checks"), []);
	assert.deepEqual(validateBranchName("fix/123-null-output"), []);
	assert.deepEqual(validateBranchName("ci/trunk-based-delivery"), []);
	assert.deepEqual(
		validateBranchName("release-please--branches--main--components--stackwarden"),
		[],
	);
	assert.deepEqual(validateBranchName("dependabot/npm_and_yarn/node-22"), []);
});

test("rejects long-lived or inconsistently named branches", () => {
	assert.notDeepEqual(validateBranchName("develop"), []);
	assert.notDeepEqual(validateBranchName("feature/policy-checks"), []);
	assert.notDeepEqual(validateBranchName("feat/Policy_Checks"), []);
	assert.notDeepEqual(validateBranchName("feat/policy--checks"), []);
});
