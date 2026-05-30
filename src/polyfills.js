/* Copyright 2026 ngx-extended-pdf-viewer contributors.
 *
 * Added to the ngx-extended-pdf-viewer fork of pdf.js (mypdf.js);
 * not part of upstream Mozilla pdf.js.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// #1321 added by ngx-extended-pdf-viewer
// Runtime polyfills for the modern (non-legacy) build. pdf.js v6 calls
// `AbortSignal.any()` from main-thread modules (and may call it from the
// worker in a future version). Safari 17.4 shipped `Promise.withResolvers`
// (our "modern" gate in op-chaining-support.js) before `AbortSignal.any`
// was added in 17.5, so without this shim that thin window would fall back
// to viewer-es5.mjs unnecessarily. The legacy build gets the same polyfill
// via core-js + Babel.
//
// This module is imported as a side-effect *before* any other import in
// the viewer / worker entry points so depth-first ES module evaluation
// runs the polyfill before any imported code can touch AbortSignal.any.
if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any !== "function") {
  AbortSignal.any = function (signals) {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        return controller.signal;
      }
      signal.addEventListener(
        "abort",
        () => controller.abort(signal.reason),
        { once: true }
      );
    }
    return controller.signal;
  };
}
// #1321 end of addition by ngx-extended-pdf-viewer
