/* Copyright 2012 Mozilla Foundation
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

/** @typedef {import("../src/display/api").PDFPageProxy} PDFPageProxy */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/display_utils").PageViewport} PageViewport */
/** @typedef {import("./text_highlighter").TextHighlighter} TextHighlighter */
// eslint-disable-next-line max-len
/** @typedef {import("./text_accessibility.js").TextAccessibilityManager} TextAccessibilityManager */

import { normalizeUnicode, TextLayer } from "pdfjs-lib";
import { removeNullCharacters } from "./ui_utils.js";

/**
 * @typedef {Object} TextLayerBuilderOptions
 * @property {PDFPageProxy} pdfPage
 * @property {TextHighlighter} [highlighter] - Optional object that will handle
 *   highlighting text from the find controller.
 * @property {TextAccessibilityManager} [accessibilityManager]
 * @property {function} [onAppend]
 */

/**
 * The text layer builder provides text selection functionality for the PDF.
 * It does this by creating overlay divs over the PDF's text. These divs
 * contain text that matches the PDF text they are overlaying.
 */
class TextLayerBuilder {
  __enablePermissions = false;

  __onAppend = null;

  __renderingDone = false;

  __textLayer = null;

  static __textLayers = new Map();

  static __selectionChangeAbortController = null;

  constructor({
    pdfPage,
    highlighter = null,
    accessibilityManager = null,
    enablePermissions = false,
    onAppend = null,
  }) {
    this.pdfPage = pdfPage;
    this.highlighter = highlighter;
    this.accessibilityManager = accessibilityManager;
    this.__enablePermissions = enablePermissions === true;
    this.__onAppend = onAppend;

    this.div = document.createElement("div");
    this.div.tabIndex = 0;
    this.div.className = "textLayer";
  }

  /**
   * Renders the text layer.
   * @param {PageViewport} viewport
   * @param {Object} [textContentParams]
   */
  async render(viewport, textContentParams = null) {
    if (this.__renderingDone && this.__textLayer) {
      this.__textLayer.update({
        viewport,
        onBefore: this.hide.bind(this),
      });
      this.show();
      return;
    }

    this.cancel();
    this.__textLayer = new TextLayer({
      textContentSource: this.pdfPage.streamTextContent(
        textContentParams || {
          includeMarkedContent: true,
          disableNormalization: true,
        }
      ),
      container: this.div,
      viewport,
    });

    const { textDivs, textContentItemsStr } = this.__textLayer;
    this.highlighter?.setTextMapping(textDivs, textContentItemsStr);
    this.accessibilityManager?.setTextMapping(textDivs);

    await this.__textLayer.render();
    this.__renderingDone = true;

    const endOfContent = document.createElement("div");
    endOfContent.className = "endOfContent";
    this.div.append(endOfContent);

    this.__bindMouse(endOfContent);
    // Ensure that the textLayer is appended to the DOM *before* handling
    // e.g. a pending search operation.
    this.__onAppend?.(this.div);
    this.highlighter?.enable();
    this.accessibilityManager?.enable();
  }

  hide() {
    if (!this.div.hidden && this.__renderingDone) {
      // We turn off the highlighter in order to avoid to scroll into view an
      // element of the text layer which could be hidden.
      this.highlighter?.disable();
      this.div.hidden = true;
    }
  }

  show() {
    if (this.div.hidden && this.__renderingDone) {
      this.div.hidden = false;
      this.highlighter?.enable();
    }
  }

  /**
   * Cancel rendering of the text layer.
   */
  cancel() {
    this.__textLayer?.cancel();
    this.__textLayer = null;

    this.highlighter?.disable();
    this.accessibilityManager?.disable();
    TextLayerBuilder.__removeGlobalSelectionListener(this.div);
  }

  /**
   * Improves text selection by adding an additional div where the mouse was
   * clicked. This reduces flickering of the content if the mouse is slowly
   * dragged up or down.
   */
  __bindMouse(end) {
    const { div } = this;

    div.addEventListener("mousedown", evt => {
      end.classList.add("active");
    });

    div.addEventListener("copy", event => {
      if (!this.__enablePermissions) {
        const selection = document.getSelection();
        event.clipboardData.setData(
          "text/plain",
          removeNullCharacters(normalizeUnicode(selection.toString()))
        );
      }
      event.preventDefault();
      event.stopPropagation();
    });

    TextLayerBuilder.__textLayers.set(div, end);
    TextLayerBuilder.__enableGlobalSelectionListener();
  }

  static __removeGlobalSelectionListener(textLayerDiv) {
    this.__textLayers.delete(textLayerDiv);

    if (this.__textLayers.size === 0) {
      this.__selectionChangeAbortController?.abort();
      this.__selectionChangeAbortController = null;
    }
  }

  static __enableGlobalSelectionListener() {
    if (this.__selectionChangeAbortController) {
      // document-level event listeners already installed
      return;
    }
    this.__selectionChangeAbortController = new AbortController();
    const { signal } = this.__selectionChangeAbortController;

    const reset = (end, textLayer) => {
      if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
        textLayer.append(end);
        end.style.width = "";
        end.style.height = "";
      }
      end.classList.remove("active");
    };

    document.addEventListener(
      "pointerup",
      () => {
        this.__textLayers.forEach(reset);
      },
      { signal }
    );

    if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
      // eslint-disable-next-line no-var
      var isFirefox, prevRange;
    }

    document.addEventListener(
      "selectionchange",
      () => {
        const selection = document.getSelection();
        if (selection.rangeCount === 0) {
          this.__textLayers.forEach(reset);
          return;
        }
        // #2349 modified by ngx-extended-pdf-viewer
        if (this.__textLayers.size === 0) {
          // prevent exceptions if there's no text layer
          return;
        }
        // #2349 end of modification by ngx-extended-pdf-viewer

        // Even though the spec says that .rangeCount should be 0 or 1, Firefox
        // creates multiple ranges when selecting across multiple pages.
        // Make sure to collect all the .textLayer elements where the selection
        // is happening.
        const activeTextLayers = new Set();
        for (let i = 0; i < selection.rangeCount; i++) {
          const range = selection.getRangeAt(i);
          for (const textLayerDiv of this.__textLayers.keys()) {
            if (
              !activeTextLayers.has(textLayerDiv) &&
              range.intersectsNode(textLayerDiv)
            ) {
              activeTextLayers.add(textLayerDiv);
            }
          }
        }

        for (const [textLayerDiv, endDiv] of this.__textLayers) {
          if (activeTextLayers.has(textLayerDiv)) {
            endDiv.classList.add("active");
          } else {
            reset(endDiv, textLayerDiv);
          }
        }

        if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
          return;
        }
        if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("CHROME")) {
          isFirefox ??=
            getComputedStyle(
              this.__textLayers.values().next().value
            ).getPropertyValue("-moz-user-select") === "none";

          if (isFirefox) {
            return;
          }
        }
        // In non-Firefox browsers, when hovering over an empty space (thus,
        // on .endOfContent), the selection will expand to cover all the
        // text between the current selection and .endOfContent. By moving
        // .endOfContent to right after (or before, depending on which side
        // of the selection the user is moving), we limit the selection jump
        // to at most cover the enteirety of the <span> where the selection
        // is being modified.
        const range = selection.getRangeAt(0);
        const modifyStart =
          prevRange &&
          (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
            range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);
        let anchor = modifyStart ? range.startContainer : range.endContainer;
        if (anchor.nodeType === Node.TEXT_NODE) {
          anchor = anchor.parentNode;
        }

        const parentTextLayer = anchor.parentElement.closest(".textLayer");
        const endDiv = this.__textLayers.get(parentTextLayer);
        if (endDiv) {
          endDiv.style.width = parentTextLayer.style.width;
          endDiv.style.height = parentTextLayer.style.height;
          anchor.parentElement.insertBefore(
            endDiv,
            modifyStart ? anchor : anchor.nextSibling
          );
        }

        prevRange = range.cloneRange();
      },
      { signal }
    );
  }
}

export { TextLayerBuilder };
