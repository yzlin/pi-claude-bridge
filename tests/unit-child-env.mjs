/**
 * Every Claude Code subprocess the bridge spawns has to be told to keep its hands
 * off state pi owns. These are silent when missing: CC compacts or writes memory
 * on its own, nothing throws, and the damage shows up in the user's ~/.claude
 * rather than in a test.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { __test } = await import("../src/index.js");

describe("Claude Code child environment", () => {
	it("disables auto-compaction and claude.ai MCP servers", () => {
		assert.deepEqual(__test.CC_CHILD_ENV, {
			ENABLE_CLAUDEAI_MCP_SERVERS: "0",
			DISABLE_AUTO_COMPACT: "1",
		});
	});

	it("drops exported Anthropic credentials and base URL unless opted in (issue #107)", () => {
		const env = {
			PATH: "/bin",
			ANTHROPIC_API_KEY: "k",
			ANTHROPIC_AUTH_TOKEN: "t",
			ANTHROPIC_BASE_URL: "u",
			ANTHROPIC_MODEL: "m",
		};
		const child = __test.claudeChildEnv({}, env);
		assert.equal(child.PATH, "/bin");
		assert.equal(child.ANTHROPIC_MODEL, "m");
		assert.equal(child.DISABLE_AUTO_COMPACT, "1");
		for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]) {
			assert.equal(key in child, false, key);
		}
		assert.equal(env.ANTHROPIC_API_KEY, "k", "input env is not mutated");

		const inherited = __test.claudeChildEnv({ inheritAnthropicEnv: true }, env);
		assert.equal(inherited.ANTHROPIC_API_KEY, "k");
		assert.equal(inherited.ANTHROPIC_AUTH_TOKEN, "t");
		assert.equal(inherited.ANTHROPIC_BASE_URL, "u");
	});

	// Deliberately not asserted here: that every `query()` call site spreads the
	// constant. The only way to check that from a unit test is to grep src/index.ts,
	// which fails on innocent indirection (`env: childEnv`) and would have to be
	// taught about it — a brittle test that reads as coverage. The three sites
	// referencing CC_CHILD_ENV are the guard, and a fourth is a review question.
});
