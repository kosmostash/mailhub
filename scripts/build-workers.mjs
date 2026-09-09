import { readFileSync } from "node:fs";

import { build } from "esbuild";

/**
 * Bundle the two worker processes.
 *
 * KosmoJS builds source folders - HTTP applications - and the sender and the
 * SMTP listener are neither. They are plain Node entry points that share the
 * same `@/` domain, so they get the smallest build step that will do: esbuild,
 * externals taken from package.json, output beside the folders in dist/.
 */

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
/**
 * Beside `distDir`, never inside it: `dist/run.js` discovers source folders by
 * reading `dist/<folder>/kosmo.json`, so any extra directory in there is taken
 * for a folder whose manifest is missing.
 */
const outDir = `${pkg.distDir ?? "dist"}-workers`;

await build({
  entryPoints: ["workers/sender.ts", "workers/smtp.ts"],
  outdir: outDir,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // Dependencies stay external: they are installed alongside the build, and
  // better-sqlite3 is a native module that cannot be bundled anyway.
  external: Object.keys(pkg.dependencies ?? {}),
  // `@/` is the project root, the same mapping every source folder uses.
  alias: { "@": new URL("..", import.meta.url).pathname.replace(/\/$/, "") },
  logLevel: "info",
});
