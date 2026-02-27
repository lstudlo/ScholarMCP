#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const pkgDir = resolve(repoRoot, "packages/scholar-mcp");
const pkgJsonPath = resolve(pkgDir, "package.json");
const validLevels = new Set(["patch", "minor", "major"]);
const releaseType = process.argv[2] ?? "patch";
const releaseRemote = "origin";

if (!validLevels.has(releaseType)) {
  console.error(
    `Invalid release type "${releaseType}". Use one of: patch, minor, major.`
  );
  process.exit(1);
}

const run = (cmd, args, cwd = repoRoot, options = {}) => {
  const rendered = [cmd, ...args].join(" ");
  console.log(`\n> ${rendered}`);
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const runCapture = (cmd, args, cwd = repoRoot) => {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    if (stderr) {
      console.error(stderr);
    }
    process.exit(result.status ?? 1);
  }
  return (result.stdout || "").trim();
};

const isSuccess = (cmd, args, cwd = repoRoot) => {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
};

const readVersion = () =>
  JSON.parse(readFileSync(pkgJsonPath, "utf8")).version;

const ensureCleanTree = () => {
  const hasUnstaged = !isSuccess("git", ["diff", "--quiet"], repoRoot);
  const hasStaged = !isSuccess("git", ["diff", "--cached", "--quiet"], repoRoot);
  const hasUntracked =
    runCapture("git", ["ls-files", "--others", "--exclude-standard"], repoRoot)
      .length > 0;

  if (hasUnstaged || hasStaged || hasUntracked) {
    console.error(
      "Working tree is not clean. Commit or stash changes before running release."
    );
    process.exit(1);
  }
};

console.log(`Starting ${releaseType} release...`);

ensureCleanTree();

run("pnpm", ["--filter", "scholar-mcp", "release:check"]);
ensureCleanTree();
run("npm", ["version", releaseType, "--no-git-tag-version"], pkgDir);

const version = readVersion();
const tag = `v${version}`;
const branch = runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
const packageJsonRel = "packages/scholar-mcp/package.json";

run("git", ["add", packageJsonRel], repoRoot);
run("git", ["commit", "-m", `chore(release): ${tag}`], repoRoot);

if (isSuccess("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], repoRoot)) {
  console.error(`Tag ${tag} already exists locally. Bump version and retry.`);
  process.exit(1);
}
run("git", ["tag", "-a", tag, "-m", tag], repoRoot);

run("git", ["push", releaseRemote, branch], repoRoot);
run("git", ["push", releaseRemote, tag], repoRoot);

const remoteTag = runCapture(
  "git",
  ["ls-remote", "--tags", releaseRemote, `refs/tags/${tag}`],
  repoRoot
);
if (!remoteTag) {
  console.error(`Remote tag ${tag} was not found on ${releaseRemote}.`);
  process.exit(1);
}

if (isSuccess("gh", ["release", "view", tag], repoRoot)) {
  console.log(`\nRelease ${tag} already exists. Skipping gh release create.`);
} else {
  run("gh", ["release", "create", tag, "--verify-tag", "--generate-notes"], repoRoot);
}

console.log(`\nRelease completed: ${tag}`);
