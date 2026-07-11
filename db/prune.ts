import { sakinPaths } from "../config/env.js";
import { openDb } from "./adapter.js";

interface PruneArgs {
  theme: string;
  batch: string;
}

function parseArgs(argv: string[]): PruneArgs {
  const flags = new Map<string, string>();
  let unevaluatedOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--unevaluated-only") {
      unevaluatedOnly = true;
    } else if (arg === "--theme" || arg === "--batch") {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      flags.set(arg.slice(2), value);
      i += 1;
    }
  }
  if (!unevaluatedOnly) {
    throw new Error(
      "Refusing to run without --unevaluated-only (this is currently the only supported prune mode)",
    );
  }
  const theme = flags.get("theme");
  const batch = flags.get("batch");
  if (!theme || !batch) {
    throw new Error("Usage: node db/prune.js --theme <name> --batch <name> --unevaluated-only");
  }
  return { theme, batch };
}

export async function pruneUnevaluatedBatch(
  themeName: string,
  batch: string,
  dbFile: string,
): Promise<number> {
  const db = await openDb(dbFile);
  try {
    await db.migrate();
    return await db.pruneUnevaluatedBatch(themeName, batch);
  } finally {
    await db.close();
  }
}

async function main() {
  const { theme, batch } = parseArgs(process.argv.slice(2));
  const { dbFile } = sakinPaths();
  const deleted = await pruneUnevaluatedBatch(theme, batch, dbFile);
  console.log(`Deleted ${deleted} unevaluated idea(s) from ${theme}/${batch}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
