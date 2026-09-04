import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/**
 * Normalizes local import specifiers to the tsconfig path aliases of a workspace.
 *
 * The DDD move was done with VSCode's refactoring tools, which rewrite imports as
 * relative paths or (via apps/api's `"*": ["./*"]` catch-all) as bare `src/...`.
 * Both violate the "use import aliases" rule and break the moment a file moves again.
 *
 * Regex over `from "..."` rather than an AST codemod: apps/api uses double-quoted
 * specifiers exclusively, with no require(), jest.mock(), dynamic import(), re-export
 * or extension-bearing specifier anywhere. YAGNI beats pulling in ts-morph.
 *
 * Usage: tsx src/fix-import-aliases.ts [workspaceDir] [--dry]
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  "coverage",
  ".git",
]);
const SPECIFIER = /\bfrom\s+"([^"]+)"/g;

type Alias = { prefix: string; dir: string };

function log(msg: string): void {
  console.log(`[fix-import-aliases] ${msg}`);
}

/**
 * Reads the workspace tsconfig (following `extends`) and turns its `paths` into a
 * prefix -> absolute dir table. The `"*"` catch-all is deliberately excluded: it is
 * what makes the bad `src/...` imports resolve, so it must never be a rewrite target.
 * Longest target dir first, so a nested alias wins over its parent.
 */
function loadAliases(tsconfigPath: string): Alias[] {
  const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  }
  const configDir = dirname(tsconfigPath);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, configDir);
  const { paths = {}, baseUrl } = parsed.options;
  const base = baseUrl ?? configDir;

  const aliases: Alias[] = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    const prefix = pattern.endsWith("/*") ? pattern.slice(0, -1) : undefined;
    const target = targets[0];
    if (!prefix || !target?.endsWith("/*")) continue;
    aliases.push({ prefix, dir: resolve(base, target.slice(0, -2)) });
  }
  return aliases.sort((a, b) => b.dir.length - a.dir.length);
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectFiles(join(dir, entry.name), out);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// Guards against rewriting an npm package that happens to share a folder name with
// something on disk: we only touch a specifier that actually points at a module.
function moduleExists(abs: string): boolean {
  return (
    existsSync(`${abs}.ts`) ||
    existsSync(`${abs}.tsx`) ||
    existsSync(join(abs, "index.ts")) ||
    (existsSync(abs) && statSync(abs).isDirectory())
  );
}

function contains(dir: string, abs: string): boolean {
  return abs === dir || abs.startsWith(dir + sep);
}

function toAlias(abs: string, aliases: Alias[]): string | undefined {
  const hit = aliases.find((a) => contains(a.dir, abs));
  if (!hit) return undefined;
  return hit.prefix + relative(hit.dir, abs).split(sep).join("/");
}

type Rewrite = { content: string; fixed: number; unresolved: string[] };

function rewriteFile(
  file: string,
  content: string,
  aliases: Alias[],
  configDir: string,
): Rewrite {
  let fixed = 0;
  const unresolved: string[] = [];

  const next = content.replace(SPECIFIER, (match, spec: string) => {
    if (aliases.some((a) => spec.startsWith(a.prefix))) return match;

    const isRelative = spec.startsWith("./") || spec.startsWith("../");
    // A bare specifier is resolved against the tsconfig dir, which is exactly what
    // the `"*": ["./*"]` catch-all does — that's how `src/...` imports work today.
    const abs = isRelative
      ? resolve(dirname(file), spec)
      : resolve(configDir, spec);
    if (!moduleExists(abs)) return match;

    const alias = toAlias(abs, aliases);
    if (!alias) {
      if (isRelative) unresolved.push(spec);
      return match;
    }

    fixed++;
    return `from "${alias}"`;
  });

  return { content: next, fixed, unresolved };
}

function main(): void {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const workspace = resolve(
    REPO_ROOT,
    args.find((a) => !a.startsWith("--")) ?? "apps/api",
  );
  const tsconfigPath = join(workspace, "tsconfig.json");

  if (!existsSync(tsconfigPath)) {
    throw new Error(`no tsconfig.json in ${workspace}`);
  }

  const aliases = loadAliases(tsconfigPath);
  if (aliases.length === 0) {
    throw new Error(`no usable path aliases in ${tsconfigPath}`);
  }

  log(
    `${relative(REPO_ROOT, workspace)}${dry ? " — DRY RUN, no files written" : ""}`,
  );
  for (const { prefix, dir } of aliases) {
    log(`  alias ${prefix}* -> ${relative(REPO_ROOT, dir)}`);
  }

  const touched: Array<{ file: string; fixed: number }> = [];
  const warnings: string[] = [];
  let totalFixed = 0;

  for (const file of collectFiles(workspace)) {
    const content = readFileSync(file, "utf8");
    const result = rewriteFile(file, content, aliases, dirname(tsconfigPath));
    const rel = relative(workspace, file);

    for (const spec of result.unresolved) {
      warnings.push(`${rel}  ${spec}`);
    }
    if (result.fixed === 0) continue;

    if (!dry) writeFileSync(file, result.content, "utf8");
    touched.push({ file: rel, fixed: result.fixed });
    totalFixed += result.fixed;
  }

  console.log("");
  const width = Math.max(0, ...touched.map((t) => t.file.length));
  for (const { file, fixed } of touched.sort((a, b) => b.fixed - a.fixed)) {
    console.log(`  ${file.padEnd(width)}  ${fixed}`);
  }

  console.log("");
  log(`${touched.length} files touched, ${totalFixed} imports fixed`);

  if (warnings.length > 0) {
    log(`${warnings.length} specifiers no alias covers (left as-is):`);
    for (const warning of warnings) console.log(`    ${warning}`);
  }
}

try {
  main();
} catch (err: unknown) {
  console.error(
    `fix-import-aliases failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
}
