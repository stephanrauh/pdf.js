/* Copyright 2013 Rob Wu <rob@robwu.nl>
 * https://github.com/Rob--W/grab-to-pan.js
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

// Class name of element which can be grabbed.
const CSS_CLASS_GRAB = "grab-to-pan-grab";

/**
 * @typedef {Object} GrabToPanOptions
 * @property {HTMLElement} element
 */

class GrabToPan {
  /**
   * Construct a GrabToPan instance for a given HTML element.
   * @param {GrabToPanOptions} options
   */
  constructor({ element }) {
    this.element = element;
    this.document = element.ownerDocument;

    // Bind the contexts to ensure that `this` always points to
    // the GrabToPan instance.
    this.activate = this.activate.bind(this);
    this.deactivate = this.deactivate.bind(this);
    this.toggle = this.toggle.bind(this);
    this._onMouseDown = this.#onMouseDown.bind(this);
    this._onMouseMove = this.#onMouseMove.bind(this);
    this._endPan = this.#endPan.bind(this);

    // This overlay will be inserted in the document when the mouse moves during
    // a grab operation, to ensure that the cursor has the desired appearance.
    const overlay = (this.overlay = document.createElement("div"));
    overlay.className = "grab-to-pan-grabbing";
  }

  /**
   * Bind a mousedown event to the element to enable grab-detection.
   */
  activate() {
    if (!this.active) {
      this.active = true;
      this.element.addEventListener("mousedown", this._onMouseDown); // #1243 modified by ngx-extended-pdf-viewer
      this.element.classList.add(CSS_CLASS_GRAB);
    }
  }

  /**
   * Removes all events. Any pending pan session is immediately stopped.
   */
  deactivate() {
    if (this.active) {
      this.active = false;
      this.element.removeEventListener("mousedown", this._onMouseDown); // #1243 modified by ngx-extended-pdf-viewer
      this._endPan();
      this.element.classList.remove(CSS_CLASS_GRAB);
    }
  }

  toggle() {
    if (this.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  /**
   * Whether to not pan if the target element is clicked.
   * Override this method to change the default behaviour.
   *
   * @param {Element} node - The target of the event.
   * @returns {boolean} Whether to not react to the click event.
   */
  ignoreTarget(node) {
      // #716 modified by ngx-extended-pdf-viewer
    if (document.querySelector(".stf__item")) {
      return true;
    }
	// #716 end of modification

    // Check whether the clicked element is, a child of, an input element/link.
    return node.matches(
      "a[href], a[href] *, input, textarea, button, button *, select, option"
    );
  }

  #onMouseDown(event) {
    if (event.button !== 0 || this.ignoreTarget(event.target)) {
      return;
    }
    if (event.originalTarget) {
      try {
        // eslint-disable-next-line no-unused-expressions
        event.originalTarget.tagName;
      } catch {
        // Mozilla-specific: element is a scrollbar (XUL element)
        return;
      }
    }

    this.scrollLeftStart = this.element.scrollLeft;
    this.scrollTopStart = this.element.scrollTop;
    this.clientXStart = event.clientX;
    this.clientYStart = event.clientY;

    /* modified by ngx-extended-pdf-viewer #469 */
    if (isOverPerfectScrollbar(this.clientXStart, this.clientYStart, "ps__rail-x")) {
      return;
    }
    if (isOverPerfectScrollbar(this.clientXStart, this.clientYStart, "ps__rail-y")) {
      return;
    }
    /* end of modification */

    this.document.addEventListener("mousemove", this._onMouseMove, true);
    this.document.addEventListener("mouseup", this._endPan, true);
    // When a scroll event occurs before a mousemove, assume that the user
    // dragged a scrollbar (necessary for Opera Presto, Safari and IE)
    // (not needed for Chrome/Firefox)
    this.element.addEventListener("scroll", this._endPan, true);
    event.preventDefault();
    event.stopPropagation();

    const focusedElement = document.activeElement;
    if (focusedElement && !focusedElement.contains(event.target)) {
      focusedElement.blur();
    }
  }

  #onMouseMove(event) {
    this.element.removeEventListener("scroll", this._endPan, true);
    if (!(event.buttons & 1)) {
      // The left mouse button is released.
      this._endPan();
      return;
    }
    const xDiff = event.clientX - this.clientXStart;
    const yDiff = event.clientY - this.clientYStart;
    this.element.scrollTo({
      top: this.scrollTopStart - yDiff,
      left: this.scrollLeftStart - xDiff,
      behavior: "instant",
    });

    if (!this.overlay.parentNode) {
      document.body.append(this.overlay);
    }
  }

  #endPan() {
    this.element.removeEventListener("scroll", this._endPan, true);
    this.document.removeEventListener("mousemove", this._onMouseMove, true);
    this.document.removeEventListener("mouseup", this._endPan, true);
    // Note: ChildNode.remove doesn't throw if the parentNode is undefined.
    this.overlay.remove();
  }
}

/* modified by ngx-extended-pdf-viewer #469 */
function isOverPerfectScrollbar(x, y, divName) {
  const  perfectScrollbar = document.getElementsByClassName(divName);
  if (perfectScrollbar && perfectScrollbar.length === 1) {
    var {top, right, bottom, left} = perfectScrollbar[0].getBoundingClientRect();
    if (y >= top && y <= bottom) {
      if (x <= right && x >= left) {
        return true;
      }
    }
  }
  return false;
}

/* end of modification */

export { GrabToPan };
