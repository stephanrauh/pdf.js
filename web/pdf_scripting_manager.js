/* Copyright 2021 Mozilla Foundation
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

/** @typedef {import("./event_utils").EventBus} EventBus */

import { apiPageLayoutToViewerModes, RenderingStates } from "./ui_utils.js";
import { shadow } from "pdfjs-lib";

/**
 * @typedef {Object} PDFScriptingManagerOptions
 * @property {EventBus} eventBus - The application event bus.
 * @property {string} [sandboxBundleSrc] - The path and filename of the
 *   scripting bundle.
 * @property {Object} [externalServices] - The factory that is used when
 *   initializing scripting; must contain a `createScripting` method.
 *   PLEASE NOTE: Primarily intended for the default viewer use-case.
 * @property {function} [docProperties] - The function that is used to lookup
 *   the necessary document properties.
 */

class PDFScriptingManager {
  __closeCapability = null;

  __destroyCapability = null;

  __docProperties = null;

  __eventAbortController = null;

  __eventBus = null;

  __externalServices = null;

  __pdfDocument = null;

  __pdfViewer = null;

  __ready = false;

  __scripting = null;

  __willPrintCapability = null;

  /**
   * @param {PDFScriptingManagerOptions} options
   */
  constructor({ eventBus, externalServices = null, docProperties = null }) {
    this.__eventBus = eventBus;
    this.__externalServices = externalServices;
    this.__docProperties = docProperties;

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      Object.defineProperty(this, "sandboxTrip", {
        value: () =>
          setTimeout(
            () =>
              this.__scripting?.dispatchEventInSandbox({
                name: "sandboxtripbegin",
              }),
            0
          ),
      });
    }
  }

  setViewer(pdfViewer) {
    this.__pdfViewer = pdfViewer;
  }

  async setDocument(pdfDocument) {
    if (this.__pdfDocument) {
      await this.__destroyScripting();
    }
    this.__pdfDocument = pdfDocument;

    if (!pdfDocument) {
      return;
    }
    const [objects, calculationOrder, docActions] = await Promise.all([
      pdfDocument.getFieldObjects(),
      pdfDocument.getCalculationOrderIds(),
      pdfDocument.getJSActions(),
    ]);

    if (!objects && !docActions) {
      // No FieldObjects or JavaScript actions were found in the document.
      await this.__destroyScripting();
      return;
    }
    if (pdfDocument !== this.__pdfDocument) {
      return; // The document was closed while the data resolved.
    }
    try {
      this.__scripting = this.__initScripting();
    } catch (error) {
      globalThis.ngxConsole.error(`setDocument: "${error.message}".`);

      await this.__destroyScripting();
      return;
    }
    const eventBus = this.__eventBus;

    this.__eventAbortController = new AbortController();
    const { signal } = this.__eventAbortController;

    eventBus._on(
      "updatefromsandbox",
      event => {
        if (event?.source === window) {
          this.__updateFromSandbox(event.detail);
        }
      },
      { signal }
    );
    eventBus._on(
      "dispatcheventinsandbox",
      event => {
        this.__scripting?.dispatchEventInSandbox(event.detail);
      },
      { signal }
    );

    eventBus._on(
      "pagechanging",
      ({ pageNumber, previous }) => {
        if (pageNumber === previous) {
          return; // The current page didn't change.
        }
        this.__dispatchPageClose(previous);
        this.__dispatchPageOpen(pageNumber);
      },
      { signal }
    );
    eventBus._on(
      "pagerendered",
      ({ pageNumber }) => {
        if (!this._pageOpenPending.has(pageNumber)) {
          return; // No pending "PageOpen" event for the newly rendered page.
        }
        if (pageNumber !== this.__pdfViewer.currentPageNumber) {
          return; // The newly rendered page is no longer the current one.
        }
        this.__dispatchPageOpen(pageNumber);
      },
      { signal }
    );
    eventBus._on(
      "pagesdestroy",
      async () => {
        await this.__dispatchPageClose(this.__pdfViewer.currentPageNumber);

        await this.__scripting?.dispatchEventInSandbox({
          id: "doc",
          name: "WillClose",
        });

        this.__closeCapability?.resolve();
      },
      { signal }
    );

    try {
      const docProperties = await this.__docProperties(pdfDocument);
      if (pdfDocument !== this.__pdfDocument) {
        return; // The document was closed while the properties resolved.
      }

      await this.__scripting.createSandbox({
        objects,
        calculationOrder,
        appInfo: {
          platform: navigator.platform,
          language: navigator.language,
        },
        docInfo: {
          ...docProperties,
          actions: docActions,
        },
      });

      eventBus.dispatch("sandboxcreated", { source: this });
    } catch (error) {
      globalThis.ngxConsole.error(`setDocument: "${error.message}".`);

      await this.__destroyScripting();
      return;
    }

    await this.__scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "Open",
    });
    await this.__dispatchPageOpen(
      this.__pdfViewer.currentPageNumber,
      /* initialize = */ true
    );

    // Defer this slightly, to ensure that scripting is *fully* initialized.
    Promise.resolve().then(() => {
      if (pdfDocument === this.__pdfDocument) {
        this.__ready = true;
      }
    });
  }

  async dispatchWillSave() {
    return this.__scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "WillSave",
    });
  }

  async dispatchDidSave() {
    return this.__scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "DidSave",
    });
  }

  async dispatchWillPrint() {
    if (!this.__scripting) {
      return;
    }
    await this.__willPrintCapability?.promise;
    this.__willPrintCapability = Promise.withResolvers();
    try {
      await this.__scripting.dispatchEventInSandbox({
        id: "doc",
        name: "WillPrint",
      });
    } catch (ex) {
      this.__willPrintCapability.resolve();
      this.__willPrintCapability = null;
      throw ex;
    }

    await this.__willPrintCapability.promise;
  }

  async dispatchDidPrint() {
    return this.__scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "DidPrint",
    });
  }

  get destroyPromise() {
    return this.__destroyCapability?.promise || null;
  }

  get ready() {
    return this.__ready;
  }

  /**
   * @private
   */
  get _pageOpenPending() {
    return shadow(this, "_pageOpenPending", new Set());
  }

  /**
   * @private
   */
  get _visitedPages() {
    return shadow(this, "_visitedPages", new Map());
  }

  async __updateFromSandbox(detail) {
    const pdfViewer = this.__pdfViewer;
    // Ignore some events, see below, that don't make sense in PresentationMode.
    const isInPresentationMode =
      pdfViewer.isInPresentationMode || pdfViewer.isChangingPresentationMode;

    const { id, siblings, command, value } = detail;
    if (!id) {
      if (
        typeof PDFJSDev !== "undefined" &&
        PDFJSDev.test("TESTING") &&
        command === "sandboxTripEnd"
      ) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("sandboxtripend"));
        }, 0);
        return;
      }

      switch (command) {
        case "clear":
          globalThis.ngxConsole.clear();
          break;
        case "error":
          globalThis.ngxConsole.error(value);
          break;
        case "layout":
          if (!isInPresentationMode) {
            const modes = apiPageLayoutToViewerModes(value);
            pdfViewer.spreadMode = modes.spreadMode;
          }
          break;
        case "page-num":
          pdfViewer.currentPageNumber = value + 1;
          break;
        case "print":
          await pdfViewer.pagesPromise;
          this.__eventBus.dispatch("print", { source: this });
          break;
        case "println":
          globalThis.ngxConsole.log(value);
          break;
        case "zoom":
          if (!isInPresentationMode) {
            pdfViewer.currentScaleValue = value;
          }
          break;
        case "SaveAs":
          this.__eventBus.dispatch("download", { source: this });
          break;
        case "FirstPage":
          pdfViewer.currentPageNumber = 1;
          break;
        case "LastPage":
          pdfViewer.currentPageNumber = pdfViewer.pagesCount;
          break;
        case "NextPage":
          pdfViewer.nextPage();
          break;
        case "PrevPage":
          pdfViewer.previousPage();
          break;
        case "ZoomViewIn":
          if (!isInPresentationMode) {
            pdfViewer.increaseScale();
          }
          break;
        case "ZoomViewOut":
          if (!isInPresentationMode) {
            pdfViewer.decreaseScale();
          }
          break;
        case "WillPrintFinished":
          this.__willPrintCapability?.resolve();
          this.__willPrintCapability = null;
          break;
      }
      return;
    }

    if (isInPresentationMode && detail.focus) {
      return;
    }
    delete detail.id;
    delete detail.siblings;

    const ids = siblings ? [id, ...siblings] : [id];
    for (const elementId of ids) {
      const element = document.querySelector(
        `[data-element-id="${elementId}"]`
      );
      if (element) {
        element.dispatchEvent(new CustomEvent("updatefromsandbox", { detail }));
      } else {
        // The element hasn't been rendered yet, use the AnnotationStorage.
        this.__pdfDocument?.annotationStorage.setValue(elementId, detail);
      }
    }
  }

  async __dispatchPageOpen(pageNumber, initialize = false) {
    const pdfDocument = this.__pdfDocument,
      visitedPages = this._visitedPages;

    if (initialize) {
      this.__closeCapability = Promise.withResolvers();
    }
    if (!this.__closeCapability) {
      return; // Scripting isn't fully initialized yet.
    }
    const pageView = this.__pdfViewer.getPageView(/* index = */ pageNumber - 1);

    if (pageView?.renderingState !== RenderingStates.FINISHED) {
      this._pageOpenPending.add(pageNumber);
      return; // Wait for the page to finish rendering.
    }
    this._pageOpenPending.delete(pageNumber);

    const actionsPromise = (async () => {
      // Avoid sending, and thus serializing, the `actions` data more than once.
      const actions = await (!visitedPages.has(pageNumber)
        ? pageView.pdfPage?.getJSActions()
        : null);
      if (pdfDocument !== this.__pdfDocument) {
        return; // The document was closed while the actions resolved.
      }

      await this.__scripting?.dispatchEventInSandbox({
        id: "page",
        name: "PageOpen",
        pageNumber,
        actions,
      });
    })();
    visitedPages.set(pageNumber, actionsPromise);
  }

  async __dispatchPageClose(pageNumber) {
    const pdfDocument = this.__pdfDocument,
      visitedPages = this._visitedPages;

    if (!this.__closeCapability) {
      return; // Scripting isn't fully initialized yet.
    }
    if (this._pageOpenPending.has(pageNumber)) {
      return; // The page is still rendering; no "PageOpen" event dispatched.
    }
    const actionsPromise = visitedPages.get(pageNumber);
    if (!actionsPromise) {
      return; // The "PageClose" event must be preceded by a "PageOpen" event.
    }
    visitedPages.set(pageNumber, null);

    // Ensure that the "PageOpen" event is dispatched first.
    await actionsPromise;
    if (pdfDocument !== this.__pdfDocument) {
      return; // The document was closed while the actions resolved.
    }

    await this.__scripting?.dispatchEventInSandbox({
      id: "page",
      name: "PageClose",
      pageNumber,
    });
  }

  __initScripting() {
    this.__destroyCapability = Promise.withResolvers();

    if (this.__scripting) {
      throw new Error("#initScripting: Scripting already exists.");
    }
    return this.__externalServices.createScripting();
  }

  async __destroyScripting() {
    if (!this.__scripting) {
      this.__pdfDocument = null;

      this.__destroyCapability?.resolve();
      return;
    }
    if (this.__closeCapability) {
      await Promise.race([
        this.__closeCapability.promise,
        new Promise(resolve => {
          // Avoid the scripting/sandbox-destruction hanging indefinitely.
          setTimeout(resolve, 1000);
        }),
      ]).catch(() => {
        // Ignore any errors, to ensure that the sandbox is always destroyed.
      });
      this.__closeCapability = null;
    }
    this.__pdfDocument = null;

    try {
      await this.__scripting.destroySandbox();
    } catch {}

    this.__willPrintCapability?.reject(new Error("Scripting destroyed."));
    this.__willPrintCapability = null;

    this.__eventAbortController?.abort();
    this.__eventAbortController = null;

    this._pageOpenPending.clear();
    this._visitedPages.clear();

    this.__scripting = null;
    this.__ready = false;

    this.__destroyCapability?.resolve();
  }
}

export { PDFScriptingManager };
