import { sakinPaths } from "../config/env.js";
import { loadThemesDir } from "../config/themes.js";
import { openDb } from "./adapter.js";

export async function syncThemes(themesDir: string, dbFile: string): Promise<string[]> {
  const themes = loadThemesDir(themesDir);
  const db = await openDb(dbFile);
  try {
    await db.migrate();
    for (const theme of themes) {
      await db.upsertTheme(theme);
    }
  } finally {
    await db.close();
  }
  return themes.map((t) => t.name);
}

async function main() {
  const paths = sakinPaths();
  const names = await syncThemes(paths.themesDir, paths.dbFile);
  console.log(`Synced ${names.length} theme(s): ${names.join(", ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
