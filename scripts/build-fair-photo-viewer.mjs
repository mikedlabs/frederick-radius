import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
// Next is a direct pinned application dependency and already ships this compiler.
// No undeclared transitive bundler or separately downloaded runtime is required.
const { webpack } = require("next/dist/compiled/webpack/webpack");
const { minify } = require("next/dist/compiled/terser");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function buildFairPhotoViewer() {
  return new Promise((resolveBuild, reject) => {
    const compiler = webpack({
      mode: "production",
      target: ["web", "es2020"],
      devtool: false,
      context: root,
      entry: resolve(root, "src/viewers/fair-photo/main.ts"),
      output: {
        path: resolve(root, "public/fair-viewer-assets"),
        filename: "viewer.js",
        chunkFilename: "[contenthash].js",
        publicPath: "/fair-viewer-assets/",
      },
      resolve: { extensions: [".ts", ".js", ".mjs"] },
      module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, use: resolve(root, "scripts/lib/fair-viewer-typescript-loader.cjs") }] },
      // Next's webpack build references an internal default-minimizer path
      // it does not distribute. Use its shipped Terser directly instead.
      optimization: { minimize: false },
      plugins: [{
        apply(compiler) {
          compiler.hooks.thisCompilation.tap("FairPhotoMinify", (compilation) => {
            compilation.hooks.processAssets.tap({
              name: "FairPhotoLicenses",
              stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
            }, () => {
              const notices = ["@sparkjsdev/spark", "three", "fflate"].map((name) => {
                const license = readFileSync(resolve(root, "node_modules", name, "LICENSE"), "utf8");
                return `${name}\n${license}`;
              }).join("\n\n");
              compilation.emitAsset("THIRD_PARTY_LICENSES.txt", new compiler.webpack.sources.RawSource(notices));
            });
            compilation.hooks.processAssets.tapPromise({
              name: "FairPhotoMinify",
              stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
            }, async (assets) => {
              await Promise.all(Object.keys(assets).filter((name) => name.endsWith(".js")).map(async (name) => {
                const result = await minify(assets[name].source().toString(), { format: { comments: /@license|@preserve|^!/ } });
                if (!result.code) throw new Error(`Empty viewer asset: ${name}`);
                compilation.updateAsset(name, new compiler.webpack.sources.RawSource(result.code));
              }));
            });
          });
        },
      }],
    });
    compiler.run((error, stats) => {
      compiler.close((closeError) => {
        if (error || closeError) return reject(error || closeError);
        if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
        console.log(stats.toString({ all: false, assets: true, timings: true }));
        resolveBuild();
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildFairPhotoViewer();
}
