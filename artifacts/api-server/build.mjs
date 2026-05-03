import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, mkdir, copyFile, readdir, readFile, writeFile } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it.
      // @logtail/pino is the Better Stack transport — it MUST be listed here
      // (not just installed) or pino fails at runtime with "unable to
      // determine transport target for @logtail/pino" because the bundled
      // worker entry never gets emitted.
      esbuildPluginPino({ transports: ["pino-pretty", "@logtail/pino"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    //
    // We also force-inject __bundlerPathsOverrides into EVERY output bundle.
    // esbuild-plugin-pino uses a one-shot flag and only injects the override
    // map into the FIRST bundle that imports pino during a given build. Across
    // rebuilds, esbuild's parallel processing makes that "first" bundle
    // non-deterministic — sometimes it's index.mjs, sometimes a transport
    // entry like @logtail/pino.mjs. When the main bundle misses out, pino's
    // transport.js falls back to `join(__dirname, 'worker.js')` and crashes
    // with `Cannot find module .../dist/worker.js`. Setting the overrides in
    // the banner is idempotent (we spread any existing overrides) and runs
    // before any pino code, so it works regardless of the plugin's ordering.
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
import __bannerFs from 'node:fs';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);

if (!globalThis.__pinoDistDir) {
  let __d = globalThis.__dirname;
  let __found = false;
  for (let __i = 0; __i < 4; __i++) {
    if (__bannerFs.existsSync(__bannerPath.join(__d, 'thread-stream-worker.mjs'))) {
      globalThis.__pinoDistDir = __d;
      __found = true;
      break;
    }
    const __parent = __bannerPath.dirname(__d);
    if (__parent === __d) break;
    __d = __parent;
  }
  if (!__found) {
    globalThis.__pinoDistDir = globalThis.__dirname;
    // eslint-disable-next-line no-console
    console.warn('[pino-bundle] could not locate dist root from ' + globalThis.__dirname + '; falling back to __dirname. Worker resolution may fail.');
  }
}
globalThis.__bundlerPathsOverrides = {
  ...(globalThis.__bundlerPathsOverrides || {}),
  'thread-stream-worker': __bannerPath.join(globalThis.__pinoDistDir, 'thread-stream-worker.mjs'),
  'pino-worker': __bannerPath.join(globalThis.__pinoDistDir, 'pino-worker.mjs'),
  'pino/file': __bannerPath.join(globalThis.__pinoDistDir, 'pino-file.mjs'),
  'pino-pretty': __bannerPath.join(globalThis.__pinoDistDir, 'pino-pretty.mjs'),
  '@logtail/pino': __bannerPath.join(globalThis.__pinoDistDir, '@logtail/pino.mjs'),
};
    `,
    },
  });

  // Belt-and-suspenders: also mirror the thread-stream worker at the legacy
  // fallback path `dist/lib/worker.js` so any code path that bypasses our
  // override (e.g. a transitive transport that re-resolves pino lazily) still
  // resolves to a working worker file rather than crashing.
  const libDir = path.join(distDir, "lib");
  await mkdir(libDir, { recursive: true });
  await copyFile(
    path.join(distDir, "thread-stream-worker.mjs"),
    path.join(libDir, "worker.js"),
  );

  // esbuild-plugin-pino's own injection (which lands in whichever bundle wins
  // its one-shot onLoad race) hardcodes the build-time absolute path of the
  // dist directory into a `const outputDir = "<absolute path>"` line. Because
  // pino loads `lib/transport.js` lazily AFTER our banner has already set
  // globalThis.__bundlerPathsOverrides, the plugin's spread-then-overwrite
  // pattern *clobbers* our runtime-derived paths with that stale build-time
  // path. If the deployed app runs from a different absolute location than the
  // build container, worker resolution explodes with ENOENT. Patch the plugin
  // injection so it prefers our runtime-derived globalThis.__pinoDistDir,
  // falling back to the original bundled path only when our banner hasn't
  // run (defensive — in practice the banner always runs first).
  const PLUGIN_OUTPUT_DIR_RE =
    /const outputDir = "((?:\\.|[^"\\])+)"/g;
  const distEntries = await readdir(distDir, {
    withFileTypes: true,
    recursive: true,
  });
  for (const entry of distEntries) {
    if (!entry.isFile()) continue;
    if (!/\.(mjs|js)$/.test(entry.name)) continue;
    const filePath = path.join(entry.parentPath ?? entry.path, entry.name);
    const original = await readFile(filePath, "utf8");
    if (!PLUGIN_OUTPUT_DIR_RE.test(original)) continue;
    PLUGIN_OUTPUT_DIR_RE.lastIndex = 0;
    const patched = original.replace(
      PLUGIN_OUTPUT_DIR_RE,
      'const outputDir = (globalThis.__pinoDistDir || "$1")',
    );
    if (patched !== original) {
      await writeFile(filePath, patched, "utf8");
    }
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
