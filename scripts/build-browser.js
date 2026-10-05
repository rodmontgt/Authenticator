// Portable development builds for Chrome and Edge; no Bash required.
/* eslint-disable @typescript-eslint/no-var-requires -- Node build scripts use CommonJS. */
const fs = require("fs");
const path = require("path");
const webpack = require("webpack");
const sass = require("sass");
const { configureManifest } = require("./configure-cloud-manifest");

const root = path.resolve(__dirname, "..");
const target = process.argv[2] || "all";
const watch = process.argv.includes("--watch");
if (!["chrome", "edge", "all"].includes(target)) {
  console.error(
    "Usage: node scripts/build-browser.js [chrome|edge|all] [--watch]"
  );
  process.exit(1);
}
process.chdir(root);
const buildRoot = path.join(root, "build");
const targets = target === "all" ? ["chrome", "edge"] : [target];
const config = require("../webpack.config.js");
config.output = {
  ...config.output,
  path: path.join(buildRoot, ".bundles"),
};

function packageExtensions() {
  for (const browser of targets) {
    const output = path.resolve(buildRoot, browser);
    // Only replace the selected generated directory inside this workspace.
    if (path.dirname(output) !== buildRoot) {
      throw new Error("Invalid build destination");
    }
    fs.rmSync(output, { recursive: true, force: true });
    fs.mkdirSync(output, { recursive: true });
    for (const item of ["images", "_locales", "view", "LICENSE"]) {
      fs.cpSync(path.join(root, item), path.join(output, item), {
        recursive: true,
      });
    }
    fs.cpSync(config.output.path, path.join(output, "dist"), {
      recursive: true,
    });
    const css = path.join(output, "css");
    fs.mkdirSync(css, { recursive: true });
    for (const name of fs.readdirSync(path.join(root, "sass"))) {
      if (!name.endsWith(".scss") || name.startsWith("_")) continue;
      const result = sass.compile(path.join(root, "sass", name));
      fs.writeFileSync(
        path.join(css, name.replace(/\.scss$/, ".css")),
        result.css
      );
    }
    for (const name of ["DroidSansMono.woff2", "mocha.css"]) {
      fs.copyFileSync(path.join(root, "sass", name), path.join(css, name));
    }
    fs.copyFileSync(
      path.join(root, "manifests", `manifest-${browser}.json`),
      path.join(output, "manifest.json")
    );
    configureManifest(path.join(output, "manifest.json"));
    fs.copyFileSync(
      path.join(root, "manifests", "schema-chrome.json"),
      path.join(output, "schema.json")
    );
    fs.copyFileSync(
      path.join(root, "manifests", "manifest-pwa.json"),
      path.join(output, "manifest-pwa.json")
    );
    console.log(`Ready to load: ${output}`);
  }
}

const compiler = webpack(config);
function handleBuild(error, stats) {
  if (error || stats.hasErrors()) {
    console.error(error || stats.toString({ all: false, errors: true }));
    if (!watch) process.exitCode = 1;
    return;
  }
  console.log(stats.toString({ all: false, timings: true, warnings: true }));
  try {
    packageExtensions();
  } catch (packagingError) {
    console.error(packagingError);
    if (!watch) process.exitCode = 1;
  }
}
if (watch) {
  compiler.watch({ ignored: /node_modules/ }, handleBuild);
} else {
  compiler.run((error, stats) => {
    handleBuild(error, stats);
    compiler.close((closeError) => {
      if (closeError) {
        console.error(closeError);
        process.exitCode = 1;
      }
    });
  });
}
