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

import { DOMSVGFactory, shadow } from "pdfjs-lib";

class AltTextManager {
  __boundUpdateUIState = this.__updateUIState.bind(this);

  __boundSetPosition = this.__setPosition.bind(this);

  __boundOnClick = this.__onClick.bind(this);

  __currentEditor = null;

  __cancelButton;

  __dialog;

  __eventBus;

  __hasUsedPointer = false;

  __optionDescription;

  __optionDecorative;

  __overlayManager;

  __saveButton;

  __textarea;

  __uiManager;

  __previousAltText = null;

  __svgElement = null;

  __rectElement = null;

  __container;

  __telemetryData = null;

  constructor(
    {
      dialog,
      optionDescription,
      optionDecorative,
      textarea,
      cancelButton,
      saveButton,
    },
    container,
    overlayManager,
    eventBus
  ) {
    this.__dialog = dialog;
    this.__optionDescription = optionDescription;
    this.__optionDecorative = optionDecorative;
    this.__textarea = textarea;
    this.__cancelButton = cancelButton;
    this.__saveButton = saveButton;
    this.__overlayManager = overlayManager;
    this.__eventBus = eventBus;
    this.__container = container;

    dialog.addEventListener("close", this.__close.bind(this));
    dialog.addEventListener("contextmenu", event => {
      if (event.target !== this.__textarea) {
        event.preventDefault();
      }
    });
    cancelButton.addEventListener("click", this.__finish.bind(this));
    saveButton.addEventListener("click", this.__save.bind(this));
    optionDescription.addEventListener("change", this.__boundUpdateUIState);
    optionDecorative.addEventListener("change", this.__boundUpdateUIState);

    this.__overlayManager.register(dialog);
  }

  get _elements() {
    return shadow(this, "_elements", [
      this.__optionDescription,
      this.__optionDecorative,
      this.__textarea,
      this.__saveButton,
      this.__cancelButton,
    ]);
  }

  __createSVGElement() {
    if (this.__svgElement) {
      return;
    }

    // We create a mask to add to the dialog backdrop: the idea is to have a
    // darken background everywhere except on the editor to clearly see the
    // picture to describe.

    const svgFactory = new DOMSVGFactory();
    const svg = (this.__svgElement = svgFactory.createElement("svg"));
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    const defs = svgFactory.createElement("defs");
    svg.append(defs);
    const mask = svgFactory.createElement("mask");
    defs.append(mask);
    mask.setAttribute("id", "alttext-manager-mask");
    mask.setAttribute("maskContentUnits", "objectBoundingBox");
    let rect = svgFactory.createElement("rect");
    mask.append(rect);
    rect.setAttribute("fill", "white");
    rect.setAttribute("width", "1");
    rect.setAttribute("height", "1");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");

    rect = this.__rectElement = svgFactory.createElement("rect");
    mask.append(rect);
    rect.setAttribute("fill", "black");
    this.__dialog.append(svg);
  }

  async editAltText(uiManager, editor) {
    if (this.__currentEditor || !editor) {
      return;
    }

    this.__createSVGElement();

    this.__hasUsedPointer = false;
    for (const element of this._elements) {
      element.addEventListener("click", this.__boundOnClick);
    }

    const { altText, decorative } = editor.altTextData;
    if (decorative === true) {
      this.__optionDecorative.checked = true;
      this.__optionDescription.checked = false;
    } else {
      this.__optionDecorative.checked = false;
      this.__optionDescription.checked = true;
    }
    this.__previousAltText = this.__textarea.value = altText?.trim() || "";
    this.__updateUIState();

    this.__currentEditor = editor;
    this.__uiManager = uiManager;
    this.__uiManager.removeEditListeners();
    this.__eventBus._on("resize", this.__boundSetPosition);

    try {
      await this.__overlayManager.open(this.__dialog);
      this.__setPosition();
    } catch (ex) {
      this.__close();
      throw ex;
    }
  }

  __setPosition() {
    if (!this.__currentEditor) {
      return;
    }
    const dialog = this.__dialog;
    const { style } = dialog;
    const {
      x: containerX,
      y: containerY,
      width: containerW,
      height: containerH,
    } = this.__container.getBoundingClientRect();
    const { innerWidth: windowW, innerHeight: windowH } = window;
    const { width: dialogW, height: dialogH } = dialog.getBoundingClientRect();
    const { x, y, width, height } = this.__currentEditor.getClientDimensions();
    const MARGIN = 10;
    const isLTR = this.__uiManager.direction === "ltr";

    const xs = Math.max(x, containerX);
    const xe = Math.min(x + width, containerX + containerW);
    const ys = Math.max(y, containerY);
    const ye = Math.min(y + height, containerY + containerH);
    this.__rectElement.setAttribute("width", `${(xe - xs) / windowW}`);
    this.__rectElement.setAttribute("height", `${(ye - ys) / windowH}`);
    this.__rectElement.setAttribute("x", `${xs / windowW}`);
    this.__rectElement.setAttribute("y", `${ys / windowH}`);

    let left = null;
    let top = Math.max(y, 0);
    top += Math.min(windowH - (top + dialogH), 0);

    if (isLTR) {
      // Prefer to position the dialog "after" (so on the right) the editor.
      if (x + width + MARGIN + dialogW < windowW) {
        left = x + width + MARGIN;
      } else if (x > dialogW + MARGIN) {
        left = x - dialogW - MARGIN;
      }
    } else if (x > dialogW + MARGIN) {
      left = x - dialogW - MARGIN;
    } else if (x + width + MARGIN + dialogW < windowW) {
      left = x + width + MARGIN;
    }

    if (left === null) {
      top = null;
      left = Math.max(x, 0);
      left += Math.min(windowW - (left + dialogW), 0);
      if (y > dialogH + MARGIN) {
        top = y - dialogH - MARGIN;
      } else if (y + height + MARGIN + dialogH < windowH) {
        top = y + height + MARGIN;
      }
    }

    if (top !== null) {
      dialog.classList.add("positioned");
      if (isLTR) {
        style.left = `${left}px`;
      } else {
        style.right = `${windowW - left - dialogW}px`;
      }
      style.top = `${top}px`;
    } else {
      dialog.classList.remove("positioned");
      style.left = "";
      style.top = "";
    }
  }

  __finish() {
    if (this.__overlayManager.active === this.__dialog) {
      this.__overlayManager.close(this.__dialog);
    }
  }

  __close() {
    this.__currentEditor._reportTelemetry(
      this.__telemetryData || {
        action: "alt_text_cancel",
        alt_text_keyboard: !this.__hasUsedPointer,
      }
    );
    this.__telemetryData = null;

    this.__removeOnClickListeners();
    this.__uiManager?.addEditListeners();
    this.__eventBus._off("resize", this.__boundSetPosition);
    this.__currentEditor.altTextFinish();
    this.__currentEditor = null;
    this.__uiManager = null;
  }

  __updateUIState() {
    this.__textarea.disabled = this.__optionDecorative.checked;
  }

  __save() {
    const altText = this.__textarea.value.trim();
    const decorative = this.__optionDecorative.checked;
    this.__currentEditor.altTextData = {
      altText,
      decorative,
    };
    this.__telemetryData = {
      action: "alt_text_save",
      alt_text_description: !!altText,
      alt_text_edit:
        !!this.__previousAltText && this.__previousAltText !== altText,
      alt_text_decorative: decorative,
      alt_text_keyboard: !this.__hasUsedPointer,
    };
    this.__finish();
  }

  __onClick(evt) {
    if (evt.detail === 0) {
      return; // The keyboard was used.
    }
    this.__hasUsedPointer = true;
    this.__removeOnClickListeners();
  }

  __removeOnClickListeners() {
    for (const element of this._elements) {
      element.removeEventListener("click", this.__boundOnClick);
    }
  }

  destroy() {
    this.__uiManager = null; // Avoid re-adding the edit listeners.
    this.__finish();
    this.__svgElement?.remove();
    this.__svgElement = this.__rectElement = null;
  }
}

export { AltTextManager };
