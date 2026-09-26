/**
 * Locks that complexity vs cognitive counts stay isolated when sharing one ESLint report.
 * Existence reason: merging tree walks must NOT change either ratchet baseline semantics.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  countCognitiveViolations,
  countComplexityViolations,
  resolveEslintInvocation,
} from "../../../scripts/check/complexityEslintReport.mjs";

test("countComplexityViolations ignores cognitive-complexity messages", () => {
  const report = [
    {
      messages: [
        { ruleId: "complexity" },
        { ruleId: "max-lines-per-function" },
        { ruleId: "sonarjs/cognitive-complexity" },
        { ruleId: "sonarjs/cognitive-complexity" },
      ],
    },
  ];
  assert.equal(countComplexityViolations(report), 2);
  assert.equal(countCognitiveViolations(report), 2);
});

test("empty report → 0 for both counters", () => {
  assert.equal(countComplexityViolations([]), 0);
  assert.equal(countCognitiveViolations([]), 0);
});

test("resolveEslintInvocation prefers the local .bin shim when present", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "complexity-eslint-local-bin-"));
  const eslintBin = path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "eslint.cmd" : "eslint"
  );
  fs.mkdirSync(path.dirname(eslintBin), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  fs.writeFileSync(eslintBin, "");

  const invocation = resolveEslintInvocation(root);

  assert.equal(invocation.command, eslintBin);
  assert.equal(invocation.args.length > 0, true);
  assert.equal(invocation.shell, process.platform === "win32");
});

test("resolveEslintInvocation falls back to the ESLint package entrypoint when .bin is absent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "complexity-eslint-package-bin-"));
  const eslintPackageDir = path.join(root, "node_modules", "eslint");
  const eslintEntrypoint = path.join(eslintPackageDir, "bin", "eslint.js");
  fs.mkdirSync(path.dirname(eslintEntrypoint), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  fs.writeFileSync(
    path.join(eslintPackageDir, "package.json"),
    JSON.stringify({ name: "eslint", bin: { eslint: "bin/eslint.js" } }, null, 2) + "\n"
  );
  fs.writeFileSync(eslintEntrypoint, "");

  const invocation = resolveEslintInvocation(root);

  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args[0], eslintEntrypoint);
  assert.equal(invocation.shell, false);
});
