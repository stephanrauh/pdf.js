/* Copyright 2026 ngx-extended-pdf-viewer contributors.
 *
 * Fork-local Puppeteer smoke test for `gulp server`. Launches headless
 * Chrome, navigates to the viewer, asserts that the default PDF actually
 * renders (first page canvas drawn) and that the JS console is clean.
 * Used by the per-chunk verification step in the upstream-update runbook
 * (see workspace AGENTS.md).
 *
 * Usage:
 *   # In one shell:
 *   npx gulp server
 *   # In another:
 *   node dev-server/smoke-test.mjs
 *
 * Exit codes:
 *   0  default PDF rendered, no errors in console
 *   1  page failed to render, or console errors / page errors detected
 *
 * Optional environment variables:
 *   SMOKE_URL          URL to open (default: http://localhost:8888/web/viewer.html)
 *   SMOKE_TIMEOUT_MS   page-render timeout (default: 30000)
 *   SMOKE_SCREENSHOT   path to write a screenshot (default: dev-server/smoke-screenshot.png)
 */

import puppeteer from "puppeteer";

const URL =
  process.env.SMOKE_URL || "http://localhost:8888/web/viewer.html";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS) || 30_000;
const SCREENSHOT_PATH =
  process.env.SMOKE_SCREENSHOT || "dev-server/smoke-screenshot.png";

// Console messages we deliberately ignore. Anything else fails the smoke
// test. Keep this list small and well-justified.
const IGNORED_CONSOLE_PATTERNS = [
  // Chrome's bundled DevTools sometimes complains about extension-related
  // resources when no extension is loaded; harmless for our purposes.
  /^Failed to load resource: net::ERR_FILE_NOT_FOUND/,
  // The dev server doesn't serve a favicon; this is the matching console
  // entry for the favicon.ico request below.
  /Failed to load resource: the server responded with a status of 404 .*favicon/i,
];

// URLs whose 4xx/5xx / failed responses we ignore. Same scope rule as
// IGNORED_CONSOLE_PATTERNS.
const IGNORED_REQUEST_PATTERNS = [
  // Chrome auto-fetches /favicon.ico on navigation. pdf.js's dev server
  // doesn't serve one — this is harmless background noise, not a viewer
  // regression.
  /\/favicon\.ico(\?|$)/,
];

function isIgnored(text) {
  return IGNORED_CONSOLE_PATTERNS.some(re => re.test(text));
}

function isIgnoredRequest(url) {
  return IGNORED_REQUEST_PATTERNS.some(re => re.test(url));
}

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();

const consoleErrors = [];
const consoleWarnings = [];
const pageErrors = [];
const failedRequests = [];

page.on("console", msg => {
  const text = msg.text();
  // "Failed to load resource" console entries don't include the URL in
  // their text — it lives on msg.location().url. Check both, so the
  // favicon noise filter works.
  const locUrl = msg.location()?.url || "";
  if (isIgnored(text) || (locUrl && isIgnoredRequest(locUrl))) return;
  const type = msg.type();
  if (type === "error") consoleErrors.push(`${text} (${locUrl})`);
  else if (type === "warning") consoleWarnings.push(`${text} (${locUrl})`);
});
page.on("pageerror", err => {
  pageErrors.push(err.message || String(err));
});
page.on("requestfailed", req => {
  const url = req.url();
  if (isIgnoredRequest(url)) return;
  failedRequests.push(`${url} (${req.failure()?.errorText || "unknown"})`);
});
page.on("response", res => {
  const url = res.url();
  if (res.status() >= 400 && !isIgnoredRequest(url)) {
    failedRequests.push(`${url} (HTTP ${res.status()})`);
  }
});

let renderedOk = false;
let pageCountText = null;
let dragOk = false;
let saveOk = false;

try {
  console.log(`[smoke] opening ${URL}`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });

  // Wait until the first .page element is rendered. PDF.js sets
  // data-loaded="true" on a page div once it has been rendered to canvas.
  await page.waitForSelector('.page[data-loaded="true"]', {
    timeout: TIMEOUT_MS,
  });

  // Also confirm the toolbar shows a non-zero page count, to catch the
  // case where the viewer reports an empty document.
  pageCountText = await page.$eval("#numPages", el => el.textContent || "");
  renderedOk = /[1-9]/.test(pageCountText);
} catch (err) {
  console.error(`[smoke] FAILED to render: ${err.message}`);
}

// Phase 2 — drag a thumbnail to reorder pages.
// This exercises the thumbnail viewer's pointer-event drag flow, which
// pdf.js v6 expanded with the new "merge / reorder pages" UI. Past
// regressions: enablePageReordering=true + enableSplitMerge=false left
// the manage-menu buttons null while still allowing drag, causing
// #updateMenuEntries() to throw inside #onStartDragging.
try {
  // Force-open the sidebar by removing the `hidden` attribute. The fork
  // deliberately disables the toggle button's click handler in
  // web/sidebar.js (ngx-extended-pdf-viewer wires it up from Angular),
  // so a real click on #viewsManagerToggleButton is a no-op in the
  // standalone gulp-server context. Manipulating the attribute directly
  // is enough to make thumbnails dispatch pointer events.
  await page.evaluate(() => {
    document.getElementById("viewsManager")?.removeAttribute("hidden");
    // The thumbnails subview is hidden by default until the user opens
    // the THUMBS sidebar view; reveal it the same way.
    document.getElementById("thumbnailsView")?.classList.remove("hidden");
  });
  // Diagnostic snapshot before waiting.
  const before = await page.evaluate(() => ({
    thumbsCount: document.querySelectorAll(".thumbnail").length,
    sidebarHidden: document.getElementById("viewsManager")?.hasAttribute("hidden"),
  }));
  console.log(`[smoke] sidebar opened: ${JSON.stringify(before)}`);
  // Wait for at least two thumbnails to exist. They may not be visible yet
  // (`visible:true` would also require non-zero size and no display:none
  // ancestor), so just check for presence; in standalone mode the sidebar
  // has no animations and the thumbnails appear as soon as setDocument
  // populates them.
  await page.waitForFunction(
    () => document.querySelectorAll('.thumbnail[page-number]').length >= 2,
    { timeout: TIMEOUT_MS }
  );
  const source = await page.$('.thumbnail[page-number="1"] .thumbnailImageContainer');
  const target = await page.$('.thumbnail[page-number="3"] .thumbnailImageContainer');
  const srcBox = await source.boundingBox();
  const dstBox = await target.boundingBox();
  if (!srcBox || !dstBox) {
    throw new Error("could not get bounding box of thumbnails");
  }
  const sx = srcBox.x + srcBox.width / 2;
  const sy = srcBox.y + srcBox.height / 2;
  const dx = dstBox.x + dstBox.width / 2;
  const dy = dstBox.y + dstBox.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // Small initial movement exceeds the drag threshold and triggers
  // #onStartDragging → #selectPage → #updateMenuEntries.
  await page.mouse.move(sx, sy - 8, { steps: 5 });
  await page.mouse.move(dx, dy, { steps: 12 });
  await page.mouse.up();
  // Let things settle.
  await new Promise(r => setTimeout(r, 400));
  dragOk = true;
  console.log("[smoke] thumbnail drag completed");
} catch (err) {
  console.error(`[smoke] FAILED to drag thumbnail: ${err.message}`);
}

// Phase 3 — trigger a save. After the drag in phase 2, this.pageOrder
// has been reordered, so clicking the download button takes the "save
// with pageOrder" branch through web/app.js#save → worker SaveDocument.
// Past regression: the worker's #2943 page-reorder handler used the
// pre-v6 `Dict._map.set(...)` accessor, which crashed on v6 (where the
// map became private `#map`).
try {
  // CDP allows downloads but never writes them to disk. We don't care
  // about the file — only about errors thrown by the save flow.
  const client = await page.target().createCDPSession();
  await client.send("Browser.setDownloadBehavior", {
    behavior: "deny",
  });
  await page.click("#downloadButton");
  // Save is async; give the worker a moment to roundtrip + serialise.
  await new Promise(r => setTimeout(r, 1500));
  saveOk = true;
  console.log("[smoke] save triggered (errors, if any, listed below)");
} catch (err) {
  console.error(`[smoke] FAILED to trigger save: ${err.message}`);
}

try {
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
  console.log(`[smoke] screenshot: ${SCREENSHOT_PATH}`);
} catch (err) {
  console.warn(`[smoke] screenshot failed: ${err.message}`);
}

await browser.close();

console.log(
  `[smoke] rendered=${renderedOk}, pageCount=${JSON.stringify(pageCountText)}, ` +
  `dragOk=${dragOk}, saveOk=${saveOk}, ` +
  `pageErrors=${pageErrors.length}, consoleErrors=${consoleErrors.length}, ` +
  `consoleWarnings=${consoleWarnings.length}, failedRequests=${failedRequests.length}`
);

if (pageErrors.length) {
  console.error("[smoke] page errors:");
  for (const e of pageErrors) console.error(`  ${e}`);
}
if (consoleErrors.length) {
  console.error("[smoke] console errors:");
  for (const e of consoleErrors) console.error(`  ${e}`);
}
if (failedRequests.length) {
  console.error("[smoke] failed network requests:");
  for (const r of failedRequests) console.error(`  ${r}`);
}
if (consoleWarnings.length) {
  console.warn("[smoke] console warnings:");
  for (const w of consoleWarnings) console.warn(`  ${w}`);
}

const exitOk =
  renderedOk &&
  dragOk &&
  saveOk &&
  pageErrors.length === 0 &&
  consoleErrors.length === 0 &&
  failedRequests.length === 0;
process.exit(exitOk ? 0 : 1);
