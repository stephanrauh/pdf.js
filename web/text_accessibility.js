/* Copyright 2022 Mozilla Foundation
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

import { binarySearchFirstItem } from "./ui_utils.js";

/**
 * This class aims to provide some methods:
 *  - to reorder elements in the DOM with respect to the visual order;
 *  - to create a link, using aria-owns, between spans in the textLayer and
 *    annotations in the annotationLayer. The goal is to help to know
 *    where the annotations are in the text flow.
 */
class TextAccessibilityManager {
  __enabled = false;

  __textChildren = null;

  __textNodes = new Map();

  __waitingElements = new Map();

  setTextMapping(textDivs) {
    this.__textChildren = textDivs;
  }

  /**
   * Compare the positions of two elements, it must correspond to
   * the visual ordering.
   *
   * @param {HTMLElement} e1
   * @param {HTMLElement} e2
   * @returns {number}
   */
  static __compareElementPositions(e1, e2) {
    const rect1 = e1.getBoundingClientRect();
    const rect2 = e2.getBoundingClientRect();

    if (rect1.width === 0 && rect1.height === 0) {
      return +1;
    }

    if (rect2.width === 0 && rect2.height === 0) {
      return -1;
    }

    const top1 = rect1.y;
    const bot1 = rect1.y + rect1.height;
    const mid1 = rect1.y + rect1.height / 2;

    const top2 = rect2.y;
    const bot2 = rect2.y + rect2.height;
    const mid2 = rect2.y + rect2.height / 2;

    if (mid1 <= top2 && mid2 >= bot1) {
      return -1;
    }

    if (mid2 <= top1 && mid1 >= bot2) {
      return +1;
    }

    const centerX1 = rect1.x + rect1.width / 2;
    const centerX2 = rect2.x + rect2.width / 2;

    return centerX1 - centerX2;
  }

  /**
   * Function called when the text layer has finished rendering.
   */
  enable() {
    if (this.__enabled) {
      throw new Error("TextAccessibilityManager is already enabled.");
    }
    if (!this.__textChildren) {
      throw new Error("Text divs and strings have not been set.");
    }

    this.__enabled = true;
    this.__textChildren = this.__textChildren.slice();
    this.__textChildren.sort(TextAccessibilityManager.__compareElementPositions);

    if (this.__textNodes.size > 0) {
      // Some links have been made before this manager has been disabled, hence
      // we restore them.
      const textChildren = this.__textChildren;
      for (const [id, nodeIndex] of this.__textNodes) {
        const element = document.getElementById(id);
        if (!element) {
          // If the page was *fully* reset the element no longer exists, and it
          // will be re-inserted later (i.e. when the annotationLayer renders).
          this.__textNodes.delete(id);
          continue;
        }
        this.__addIdToAriaOwns(id, textChildren[nodeIndex]);
      }
    }

    for (const [element, isRemovable] of this.__waitingElements) {
      this.addPointerInTextLayer(element, isRemovable);
    }
    this.__waitingElements.clear();
  }

  disable() {
    if (!this.__enabled) {
      return;
    }

    // Don't clear this.#textNodes which is used to rebuild the aria-owns
    // in case it's re-enabled at some point.

    this.__waitingElements.clear();
    this.__textChildren = null;
    this.__enabled = false;
  }

  /**
   * Remove an aria-owns id from a node in the text layer.
   * @param {HTMLElement} element
   */
  removePointerInTextLayer(element) {
    if (!this.__enabled) {
      this.__waitingElements.delete(element);
      return;
    }

    const children = this.__textChildren;
    if (!children || children.length === 0) {
      return;
    }

    const { id } = element;
    const nodeIndex = this.__textNodes.get(id);
    if (nodeIndex === undefined) {
      return;
    }

    const node = children[nodeIndex];

    this.__textNodes.delete(id);
    let owns = node.getAttribute("aria-owns");
    if (owns?.includes(id)) {
      owns = owns
        .split(" ")
        .filter(x => x !== id)
        .join(" ");
      if (owns) {
        node.setAttribute("aria-owns", owns);
      } else {
        node.removeAttribute("aria-owns");
        node.setAttribute("role", "presentation");
      }
    }
  }

  __addIdToAriaOwns(id, node) {
    const owns = node.getAttribute("aria-owns");
    if (!owns?.includes(id)) {
      node.setAttribute("aria-owns", owns ? `${owns} ${id}` : id);
    }
    node.removeAttribute("role");
  }

  /**
   * Find the text node which is the nearest and add an aria-owns attribute
   * in order to correctly position this editor in the text flow.
   * @param {HTMLElement} element
   * @param {boolean} isRemovable
   * @returns {string|null} The id in the struct tree if any.
   */
  addPointerInTextLayer(element, isRemovable) {
    const { id } = element;
    if (!id) {
      return null;
    }

    if (!this.__enabled) {
      // The text layer needs to be there, so we postpone the association.
      this.__waitingElements.set(element, isRemovable);
      return null;
    }

    if (isRemovable) {
      this.removePointerInTextLayer(element);
    }

    const children = this.__textChildren;
    if (!children || children.length === 0) {
      return null;
    }

    const index = binarySearchFirstItem(
      children,
      node =>
        TextAccessibilityManager.__compareElementPositions(element, node) < 0
    );

    const nodeIndex = Math.max(0, index - 1);
    const child = children[nodeIndex];
    this.__addIdToAriaOwns(id, child);
    this.__textNodes.set(id, nodeIndex);

    const parent = child.parentNode;
    return parent?.classList.contains("markedContent") ? parent.id : null;
  }

  /**
   * Move a div in the DOM in order to respect the visual order.
   * @param {HTMLDivElement} element
   * @returns {string|null} The id in the struct tree if any.
   */
  moveElementInDOM(container, element, contentElement, isRemovable) {
    const id = this.addPointerInTextLayer(contentElement, isRemovable);

    if (!container.hasChildNodes()) {
      container.append(element);
      return id;
    }

    const children = Array.from(container.childNodes).filter(
      node => node !== element
    );

    if (children.length === 0) {
      return id;
    }

    const elementToCompare = contentElement || element;
    const index = binarySearchFirstItem(
      children,
      node =>
        TextAccessibilityManager.__compareElementPositions(
          elementToCompare,
          node
        ) < 0
    );

    if (index === 0) {
      children[0].before(element);
    } else {
      children[index - 1].after(element);
    }

    return id;
  }
}

export { TextAccessibilityManager };
