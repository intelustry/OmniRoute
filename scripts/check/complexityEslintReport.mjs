#!/usr/bin/env node
/**
 * Shared ESLint runner for complexity + cognitive-complexity ratchets.
 * One tree walk → JSON report; consumers count by ruleId (not errorCount).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG_PATH = path.join(ROOT, "eslint.complexity-ratchets.config.mjs");

/** Positional dirs — must match config `files` scopes (see check-complexity tests). */
export const ESLINT_SCAN_DIRS = ["src", "open-sse", "electron", "bin"];

const requireFromRoot = createRequire(path.join(ROOT, "package.json"));

/** Args after the eslint binary (tests lock scan dirs on this array). */
export const ESLINT_ARGS = [
  "--no-config-lookup",
  "--config",
  CONFIG_PATH,
  "--format",
  "json",
  "--cache",
  "--cache-location",
  ".eslintcache-complexity",
  ...ESLINT_SCAN_DIRS,
];

export function resolveEslintInvocation(root = ROOT) {
  const localBin = path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "eslint.cmd" : "eslint"
  );
  if (fs.existsSync(localBin)) {
    return { command: localBin, args: ESLINT_ARGS, shell: process.platform === "win32" };
  }

  const rootRequire =
    root === ROOT ? requireFromRoot : createRequire(path.join(root, "package.json"));
  const eslintPackageJson = rootRequire.resolve("eslint/package.json");
  const eslintPackage = JSON.parse(fs.readFileSync(eslintPackageJson, "utf8"));
  const eslintBin =
    typeof eslintPackage.bin === "string" ? eslintPackage.bin : eslintPackage.bin?.eslint;
  if (!eslintBin) {
    throw new Error(`Unable to resolve ESLint bin from ${eslintPackageJson}`);
  }
  return {
    command: process.execPath,
    args: [path.resolve(path.dirname(eslintPackageJson), eslintBin), ...ESLINT_ARGS],
    shell: false,
  };
}

const COMPLEXITY_RULES = new Set(["complexity", "max-lines-per-function"]);

/**
 * @param {Array<{messages?: Array<{ruleId?: string}>}>} report
 * @returns {number}
 */
export function countComplexityViolations(report) {
  let count = 0;
  for (const file of report) {
    for (const msg of file.messages || []) {
      if (COMPLEXITY_RULES.has(msg.ruleId)) count++;
    }
  }
  return count;
}

/**
 * @param {Array<{messages?: Array<{ruleId?: string}>}>} report
 * @returns {number}
 */
export function countCognitiveViolations(report) {
  let count = 0;
  for (const file of report) {
    for (const msg of file.messages || []) {
      if (msg.ruleId === "sonarjs/cognitive-complexity") count++;
    }
  }
  return count;
}

/**
 * Run ESLint once (or reuse COMPLEXITY_ESLINT_REPORT / in-process cache).
 * @returns {Array<object>}
 */
export function getComplexityEslintReport() {
  const fromEnv = process.env.COMPLEXITY_ESLINT_REPORT;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return JSON.parse(fs.readFileSync(fromEnv, "utf8"));
  }
  if (getComplexityEslintReport._cache) return getComplexityEslintReport._cache;

  let stdout;
  try {
    const invocation = resolveEslintInvocation();
    stdout = execFileSync(invocation.command, invocation.args, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      shell: invocation.shell,
    });
  } catch (err) {
    stdout = err.stdout ? String(err.stdout) : "";
    if (!stdout.trim()) throw err;
  }
  const report = JSON.parse(stdout);
  getComplexityEslintReport._cache = report;

  const outDir = path.join(ROOT, ".artifacts");
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "complexity-eslint.json"), stdout);
  } catch {
    // best-effort cache for sibling steps / local inspection
  }
  return report;
}

getComplexityEslintReport._cache = null;
