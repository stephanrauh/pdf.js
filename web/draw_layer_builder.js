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

import { DrawLayer } from "pdfjs-lib";

/**
 * @typedef {Object} DrawLayerBuilderOptions
 * @property {number} pageIndex
 */

class DrawLayerBuilder {
  __drawLayer = null;

  /**
   * @param {DrawLayerBuilderOptions} options
   */
  constructor(options) {
    this.pageIndex = options.pageIndex;
  }

  /**
   * @param {string} intent (default value is 'display')
   */
  async render(intent = "display") {
    if (intent !== "display" || this.__drawLayer || this._cancelled) {
      return;
    }
    this.__drawLayer = new DrawLayer({
      pageIndex: this.pageIndex,
    });
  }

  cancel() {
    this._cancelled = true;

    if (!this.__drawLayer) {
      return;
    }
    this.__drawLayer.destroy();
    this.__drawLayer = null;
  }

  setParent(parent) {
    this.__drawLayer?.setParent(parent);
  }

  getDrawLayer() {
    return this.__drawLayer;
  }
}

export { DrawLayerBuilder };
