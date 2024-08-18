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
// eslint-disable-next-line max-len
/** @typedef {import("./pdf_find_controller").PDFFindController} PDFFindController */

import { NgxConsole } from "../external/ngx-logger/ngx-console.js";

/**
 * @typedef {Object} TextHighlighterOptions
 * @property {PDFFindController} findController
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} pageIndex - The page index.
 */

/**
 * TextHighlighter handles highlighting matches from the FindController in
 * either the text layer or XFA layer depending on the type of document.
 */
class TextHighlighter {
  #eventAbortController = null;

  /**
   * @param {TextHighlighterOptions} options
   */
  constructor({ findController, customFindController, eventBus, pageIndex }) { // #2488 modified by ngx-extended-pdf-viewers
    this.findController = findController;
    this.customFindController = customFindController; // #2488 modified by ngx-extended-pdf-viewer
    this.matches = [];
    this.eventBus = eventBus;
    this.pageIdx = pageIndex;
    this.textDivs = null;
    this.textContentItemsStr = null;
    this.enabled = false;
  }

  /**
   * Store two arrays that will map DOM nodes to text they should contain.
   * The arrays should be of equal length and the array element at each index
   * should correspond to the other. e.g.
   * `items[0] = "<span>Item 0</span>" and texts[0] = "Item 0";
   *
   * @param {Array<Node>} divs
   * @param {Array<string>} texts
   */
  setTextMapping(divs, texts) {
    this.textDivs = divs;
    this.textContentItemsStr = texts;
  }

  /**
   * Start listening for events to update the highlighter and check if there are
   * any current matches that need be highlighted.
   */
  enable() {
    if (!this.textDivs || !this.textContentItemsStr) {
      throw new Error("Text divs and strings have not been set.");
    }
    if (this.enabled) {
      // #1501 modified by ngx-extended-pdf-viewer
      // silently swallow the error message because calling this method doesn't
      // seem to cause error, and sometimes it does happen in the wild
      return;
      // throw new Error("TextHighlighter is already enabled.");
      // #1501 end of modification by ngx-extended-pdf-viewer
    }
    this.enabled = true;

    if (!this.#eventAbortController) {
      this.#eventAbortController = new AbortController();

      this.eventBus._on(
        "updatetextlayermatches",
        evt => {
          if (evt.pageIndex === this.pageIdx || evt.pageIndex === -1) {
            this._updateMatches();
          }
        },
        { signal: this.#eventAbortController.signal }
      );
    }
    this._updateMatches();
  }

  disable() {
    if (!this.enabled) {
      return;
    }
    this.enabled = false;

    this.#eventAbortController?.abort();
    this.#eventAbortController = null;

    this._updateMatches(/* reset = */ true);
  }

  _convertMatches(
    matches,
    matchesLength,
    cssClass = "highlight",       // #2488 modified by ngx-extended-pdf-viewer
    highlightAll = false,         // #2488 modified by ngx-extended-pdf-viewer
    isPageWithSelection = false,  // #2488 modified by ngx-extended-pdf-viewer
    selectedMatchIdx = -1         // #2488 modified by ngx-extended-pdf-viewer
  ) {
    // Early exit if there is nothing to convert.
    if (!matches) {
      return [];
    }
    const { textContentItemsStr } = this;

    let i = 0,
      iIndex = 0;
    const end = textContentItemsStr.length - 1;
    const result = [];

    for (let m = 0, mm = matches.length; m < mm; m++) {
      // Calculate the start position.
      let matchIdx = matches[m];

      // Loop over the divIdxs.
      while (i !== end && matchIdx >= iIndex + textContentItemsStr[i].length) {
        iIndex += textContentItemsStr[i].length;
        i++;
      }

      if (i === textContentItemsStr.length) {
        NgxConsole.error("Could not find a matching mapping");
      }

      const match = {
        begin: {
          divIdx: i,
          offset: matchIdx - iIndex,
        },
        cssClass, // #2488 modified by ngx-extended-pdf-viewer
        highlightAll, // #2488 modified by ngx-extended-pdf-viewer
        selected: isPageWithSelection && m === selectedMatchIdx, // #2488 modified by ngx-extended-pdf-viewer
      };

      // Calculate the end position.
      matchIdx += matchesLength[m];

      // Somewhat the same array as above, but use > instead of >= to get
      // the end position right.
      while (i !== end && matchIdx > iIndex + textContentItemsStr[i].length) {
        iIndex += textContentItemsStr[i].length;
        i++;
      }

      match.end = {
        divIdx: i,
        offset: matchIdx - iIndex,
      };
      result.push(match);
    }
    return result;
  }

  _renderMatches(matches, findController) { // #2482 modified by ngx-extended-pdf-viewer
    // Early exit if there is nothing to render.
    if (matches.length === 0) {
      return;
    }
    const { pageIdx } = this;
    const { textContentItemsStr, textDivs } = this;

    let prevEnd = null;
    const infinity = {
      divIdx: -1,
      offset: undefined,
    };

    function beginText(begin, className) {
      const divIdx = begin.divIdx;
      textDivs[divIdx].textContent = "";
      return appendTextToDiv(divIdx, 0, begin.offset, className);
    }

    function appendTextToDiv(divIdx, fromOffset, toOffset, className) {
      let div = textDivs[divIdx];
      if (div.nodeType === Node.TEXT_NODE) {
        const span = document.createElement("span");
        div.before(span);
        span.append(div);
        textDivs[divIdx] = span;
        div = span;
      }
      const content = textContentItemsStr[divIdx].substring(
        fromOffset,
        toOffset
      );
      const node = document.createTextNode(content);
      if (className) {
        const span = document.createElement("span");
        span.className = `${className} appended`;
        span.append(node);
        div.append(span);
        return className.includes("selected") ? span.offsetLeft : 0;
      }
      div.append(node);
      return 0;
    }

    let lastDivIdx = -1;
    let lastOffset = -1;
    for (let i = 0; i < matches.length; i++) { // #2488 modified by ngx-extended-pdf-viewer
      const match = matches[i];
      // #2488 modified by ngx-extended-pdf-viewer
      if (!match.selected && !match.highlightAll) {
        continue;
      }
      // #2488 end of modification by ngx-extended-pdf-viewer
      const begin = match.begin;
      if (begin.divIdx === lastDivIdx && begin.offset === lastOffset) {
        // It's possible to be in this situation if we searched for a 'f' and we
        // have a ligature 'ff' in the text. The 'ff' has to be highlighted two
        // times.
        continue;
      }
      lastDivIdx = begin.divIdx;
      lastOffset = begin.offset;

      const end = match.end;
      const highlightSuffix = match.selected ? " selected" : "";
      let selectedLeft = 0;

      // Match inside new div.
      if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
        // If there was a previous div, then add the text at the end.
        if (prevEnd !== null) {
          appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
        }
        // Clear the divs and set the content until the starting point.
        beginText(begin);
      } else {
        appendTextToDiv(prevEnd.divIdx, prevEnd.offset, begin.offset);
      }

      if (begin.divIdx === end.divIdx) {
        selectedLeft = appendTextToDiv(
          begin.divIdx,
          begin.offset,
          end.offset,
          match.cssClass + highlightSuffix // #2482 modified by ngx-extended-pdf-viewer
        );
      } else {
        selectedLeft = appendTextToDiv(
          begin.divIdx,
          begin.offset,
          infinity.offset,
          match.cssClass + " begin" + highlightSuffix // #2482 modified by ngx-extended-pdf-viewer
        );
        for (let n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
          textDivs[n0].className = match.cssClass + " middle" + highlightSuffix; // #2482 modified by ngx-extended-pdf-viewer
        }
        beginText(end, match.cssClass + " end" + highlightSuffix); // #2482 modified by ngx-extended-pdf-viewer
      }
      prevEnd = end;

      if (match.selected) { // #2488 modified by ngx-extended-pdf-viewer
        // Attempt to scroll the selected match into view.
        findController.scrollMatchIntoView({
          element: textDivs[begin.divIdx],
          selectedLeft,
          pageIndex: pageIdx,
          matchIndex: i, // #2488 modified by ngx-extended-pdf-viewer
        });
      }

      // #2482 modified by ngx-extended-pdf-viewer
      if (this.textDivs.length > 0) {
        const textLayer = this.textDivs[0].closest(".textLayer");
        const highlights = textLayer.querySelectorAll(`.${match.cssClass}`);
        this.eventBus.dispatch("renderedtextlayerhighlights", { pageIndex: pageIdx, highlights });
      }
      // #2482 end of modification by ngx-extended-pdf-viewer
    }

    if (prevEnd) {
      appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
    }
  }

  _updateMatches(reset = false) {
    if (!this.enabled && !reset) {
      return;
    }
    const { findController, customFindController, matches, pageIdx } = this;
    const { textContentItemsStr, textDivs } = this;
    let clearedUntilDivIdx = -1;

    // Clear all current matches.
    for (const match of matches) {
      const begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
      for (let n = begin, end = match.end.divIdx; n <= end; n++) {
        const div = textDivs[n];
        div.textContent = textContentItemsStr[n];
        div.className = "";
      }
      clearedUntilDivIdx = match.end.divIdx + 1;
    }

    // #2488 modified by ngx-extended-pdf-viewer
    if (reset) {
      return;
    }
    // Convert the matches on the `findController` into the match format
    // used for the textLayer.
    const customPageMatches = customFindController.pageMatches[pageIdx] || null;
    const customPageMatchesLength = customFindController.pageMatchesLength[pageIdx] || null;
    const pageMatches = findController.pageMatches[pageIdx] || null;

    const customMatches = this._convertMatches(
      customPageMatches,
      customPageMatchesLength,
      "customHighlight",
      customFindController.state?.highlightAll,
      pageIdx === customFindController.selected.pageIdx,
      customFindController.selected.matchIdx
    );
    this.matches = [...customMatches];
    // #2488 end of modification by ngx-extended-pdf-viewer

    if (!findController?.highlightMatches || reset) {
      // #2488 modified by ngx-extended-pdf-viewer
      if (!reset) {
        this._renderMatches(this.matches, this.customFindController);
      }
      // #2488 end of modification by ngx-extended-pdf-viewer
    }
    // Convert the matches on the `findController` into the match format
    // used for the textLayer.
    const pageMatchesLength = findController.pageMatchesLength[pageIdx] || null;

    // #2488 modified by ngx-extended-pdf-viewer
    const convertedMatches = this._convertMatches(
      pageMatches,
      pageMatchesLength,
      "highlight",
      findController.state?.highlightAll,
      pageIdx === findController.selected.pageIdx,
      findController.selected.matchIdx
    );
    this.matches.push(...convertedMatches);
    this.matches.sort((a, b) => {
      const cmp = a.begin.divIdx - b.begin.divIdx;
      return cmp === 0 ? a.begin.offset - b.begin.offset : cmp;
    });
    this._renderMatches(this.matches, this.findController);
    // #2488 end of modification by ngx-extended-pdf-viewer
  }
}

export { TextHighlighter };
