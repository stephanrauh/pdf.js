import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";
import { preprocessPDFJSCode } from "./preprocessor2.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let errors = 0;

const baseDir = path.join(__dirname, "fixtures_esprima");
const files = fs
  .readdirSync(baseDir)
  .filter(function (name) {
    return /-expected\./.test(name);
  })
  .map(function (name) {
    return path.join(baseDir, name);
  });
files.forEach(function (expectationFilename) {
  const inFilename = expectationFilename.replace("-expected", "");
  const expectation = fs
    .readFileSync(expectationFilename)
    .toString()
    .trim()
    .replaceAll("__filename", fs.realpathSync(inFilename));
  const input = fs.readFileSync(inFilename).toString();

  const defines = {
    TRUE: true,
    FALSE: false,
    OBJ: { obj: { i: 1 }, j: 2 },
    TEXT: "text",
  };
  const map = {
    "import-alias": "import-name",
  };
  const ctx = {
    defines,
    map,
    rootPath: __dirname + "/../..",
  };
  let out;
  try {
    out = preprocessPDFJSCode(ctx, input);
  } catch (e) {
    out = ("Error: " + e.message).replaceAll(/^/gm, "//");
  }
  if (out !== expectation) {
    errors++;

    globalThis.ngxConsole.log("Assertion failed for " + inFilename);
    globalThis.ngxConsole.log("--------------------------------------------------");
    globalThis.ngxConsole.log("EXPECTED:");
    globalThis.ngxConsole.log(expectation);
    globalThis.ngxConsole.log("--------------------------------------------------");
    globalThis.ngxConsole.log("ACTUAL");
    globalThis.ngxConsole.log(out);
    globalThis.ngxConsole.log("--------------------------------------------------");
    globalThis.ngxConsole.log();
  }
});

if (errors) {
  globalThis.ngxConsole.error("Found " + errors + " expectation failures.");
  process.exit(1);
} else {
  globalThis.ngxConsole.log("All tests completed without errors.");
  process.exit(0);
}
