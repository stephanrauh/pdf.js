/* Copyright 2023 Mozilla Foundation
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

/**
 * @typedef {Object} ToolbarOptions
 * @property {HTMLDivElement} mainContainer - Main container.
 * @property {HTMLDivElement} container - Container for the toolbar.
 * @property {HTMLButtonElement} download - Button to download the document.
 */

class Toolbar {
  __buttons;

  __eventBus;

  /**
   * @param {ToolbarOptions} options
   * @param {EventBus} eventBus
   * @param {Object} nimbusData - Nimbus configuration.
   */
  constructor(options, eventBus, nimbusData) {
    this.__eventBus = eventBus;
    const buttons = [
      {
        element: options.download,
        eventName: "download",
        nimbusName: "download-button",
      },
    ];

    if (nimbusData) {
      this.__buttons = [];
      for (const button of buttons) {
        if (nimbusData[button.nimbusName]) {
          this.__buttons.push(button);
        } else {
          button.element.remove();
        }
      }
      if (this.__buttons.length > 0) {
        options.container.classList.add("show");
      } else {
        options.container.remove();
        options.mainContainer.classList.add("noToolbar");
      }
    } else {
      options.container.classList.add("show");
      this.__buttons = buttons;
    }

    // Bind the event listeners for click and various other actions.
    this.__bindListeners(options);
  }

  setPageNumber(pageNumber, pageLabel) {}

  setPagesCount(pagesCount, hasPageLabels) {}

  setPageScale(pageScaleValue, pageScale) {}

  reset() {}

  __bindListeners(options) {
    // The buttons within the toolbar.
    for (const { element, eventName, eventDetails } of this.__buttons) {
      // modified by ngx-extended-pdf-viewer
      if (!element) {
        continue;
      }
      // end of modification by ngx-extended-pdf-viewer
      element.addEventListener("click", evt => {
        if (eventName !== null) {
          this.__eventBus.dispatch(eventName, { source: this, ...eventDetails });
          this.__eventBus.dispatch("reporttelemetry", {
            source: this,
            details: {
              type: "gv-buttons",
              data: { id: `${element.id}_tapped` },
            },
          });
        }
      });
    }
  }

  updateLoadingIndicatorState(loading = false) {}
}

export { Toolbar };
