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

import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  shadow,
  Util,
} from "../../shared/util.js";
import { DrawingEditor, DrawingOptions } from "./draw.js";
import { InkDrawOutline, InkDrawOutliner } from "./drawers/inkdraw.js";
import { AnnotationEditor } from "./editor.js";
import { BasicColorPicker } from "./color_picker.js";
import { InkAnnotationElement } from "../annotation_layer.js";

class InkDrawingOptions extends DrawingOptions {
  constructor(viewerParameters) {
    super();
    this._viewParameters = viewerParameters;

    super.updateProperties({
      fill: "none",
      stroke: AnnotationEditor._defaultLineColor,
      "stroke-opacity": 1,
      "stroke-width": 1,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-miterlimit": 10,
    });
  }

  updateSVGProperty(name, value) {
    if (name === "stroke-width") {
      value ??= this["stroke-width"];
      value *= this._viewParameters.realScale;
    }
    super.updateSVGProperty(name, value);
  }

  clone() {
    const clone = new InkDrawingOptions(this._viewParameters);
    clone.updateAll(this);
    return clone;
  }
}

/**
 * Basic draw editor in order to generate an Ink annotation.
 */
class InkEditor extends DrawingEditor {
  #points = null;

  #erased = false;

  static _type = "ink";

  static _editorType = AnnotationEditorType.INK;

  static _defaultDrawingOptions = null;

  constructor(params) {
    super({ ...params, name: "inkEditor" });
    this._erasable = true;
    this._willKeepAspectRatio = true;
    this.defaultL10nId = "pdfjs-editor-ink-editor";
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
    this._defaultDrawingOptions = new InkDrawingOptions(
      uiManager.viewParameters
    );
  }

  /** @inheritdoc */
  static getDefaultDrawingOptions(options) {
    const clone = this._defaultDrawingOptions.clone();
    clone.updateProperties(options);
    return clone;
  }

  /** @inheritdoc */
  static get supportMultipleDrawings() {
    return true;
  }

  /** @inheritdoc */
  static get typesMap() {
    return shadow(
      this,
      "typesMap",
      new Map([
        [AnnotationEditorParamsType.INK_THICKNESS, "stroke-width"],
        [AnnotationEditorParamsType.INK_COLOR, "stroke"],
        [AnnotationEditorParamsType.INK_OPACITY, "stroke-opacity"],
      ])
    );
  }

  /** @inheritdoc */
  static createDrawerInstance(x, y, parentWidth, parentHeight, rotation) {
    return new InkDrawOutliner(
      x,
      y,
      parentWidth,
      parentHeight,
      rotation,
      this._defaultDrawingOptions["stroke-width"]
    );
  }

  /** @inheritdoc */
  static deserializeDraw(
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    innerMargin,
    data
  ) {
    return InkDrawOutline.deserialize(
      pageX,
      pageY,
      pageWidth,
      pageHeight,
      innerMargin,
      data
    );
  }

  /** @inheritdoc */
  static async deserialize(data, parent, uiManager) {
    let initialData = null;
    if (data instanceof InkAnnotationElement) {
      const {
        data: {
          inkLists,
          rect,
          rotation,
          id,
          color,
          opacity,
          borderStyle: { rawWidth: thickness },
          popupRef,
          richText,
          contentsObj,
          creationDate,
          modificationDate,
        },
        parent: {
          page: { pageNumber },
        },
      } = data;
      initialData = data = {
        annotationType: AnnotationEditorType.INK,
        color: Array.from(color),
        thickness,
        opacity,
        paths: { points: inkLists },
        boxes: null,
        pageIndex: pageNumber - 1,
        rect: rect.slice(0),
        rotation,
        annotationElementId: id,
        id,
        deleted: false,
        popupRef,
        richText,
        comment: contentsObj?.str || null,
        creationDate,
        modificationDate,
      };
    } else {
      // #3113 modified by ngx-extended-pdf-viewer
      // Extract comment data from popup annotation for ink annotations when deserializing from PDF
      const { popup, popupRef } = data;

      initialData = data = {
        ...data,
        popupRef: popupRef || !!(popup && popup.contents && !popup.deleted) || null,
        comment: (!popup?.deleted && popup?.contents) || null,
        commentDate: (!popup?.deleted && popup?.date) || null,
      }
      // #3113 end of modification by ngx-extended-pdf-viewer
    }

    const editor = await super.deserialize(data, parent, uiManager);
    editor._initialData = initialData;
    if (data.comment) {
      editor.setCommentData(data);
    }

    return editor;
  }

  /** @inheritdoc */
  get toolbarButtons() {
    this._colorPicker ||= new BasicColorPicker(this);
    return [["colorPicker", this._colorPicker]];
  }

  get colorType() {
    return AnnotationEditorParamsType.INK_COLOR;
  }

  get colorAndOpacityType() {
    return AnnotationEditorParamsType.INK_COLOR_AND_OPACITY;
  }

  get opacityType() {
    return AnnotationEditorParamsType.INK_OPACITY;
  }

  /** @inheritdoc */
  updateParams(type, value) {
    if (type === AnnotationEditorParamsType.INK_COLOR_AND_OPACITY) {
      this._updateColorAndOpacity(value.color, value.opacity);
      return;
    }
    super.updateParams(type, value);
  }

  /** @inheritdoc */
  static updateDefaultParams(type, value) {
    if (type === AnnotationEditorParamsType.INK_COLOR_AND_OPACITY) {
      super.updateDefaultParams(
        AnnotationEditorParamsType.INK_COLOR,
        value.color
      );
      super.updateDefaultParams(
        AnnotationEditorParamsType.INK_OPACITY,
        value.opacity
      );
      return;
    }
    super.updateDefaultParams(type, value);
  }

  get color() {
    return this._drawingOptions.stroke;
  }

  get opacity() {
    return this._drawingOptions["stroke-opacity"];
  }

  /** @inheritdoc */
  onScaleChanging() {
    if (!this.parent) {
      return;
    }
    super.onScaleChanging();
    const { _drawId, _drawingOptions, parent } = this;
    _drawingOptions.updateSVGProperty("stroke-width");
    parent.drawLayer.updateProperties(
      _drawId,
      _drawingOptions.toSVGProperties()
    );
  }

  static onScaleChangingWhenDrawing() {
    const parent = this._currentParent;
    if (!parent) {
      return;
    }
    super.onScaleChangingWhenDrawing();
    this._defaultDrawingOptions.updateSVGProperty("stroke-width");
    parent.drawLayer.updateProperties(
      this._currentDrawId,
      this._defaultDrawingOptions.toSVGProperties()
    );
  }

  /** @inheritdoc */
  createDrawingOptions({ color, thickness, opacity }) {
    this._drawingOptions = InkEditor.getDefaultDrawingOptions({
      stroke: Util.makeHexColor(...color),
      "stroke-width": thickness,
      "stroke-opacity": opacity,
    });
  }

  /** @inheritdoc */
  serialize(isForCopying = false, context = null, includeId = false) {
    if (this.isEmpty()) {
      return null;
    }

    if (this.deleted) {
      return this.serializeDeleted();
    }

    const { lines, points } = this.serializeDraw(isForCopying);
    const {
      _drawingOptions: {
        stroke,
        "stroke-opacity": opacity,
        "stroke-width": thickness,
      },
    } = this;
    const serialized = Object.assign(super.serialize(isForCopying, context), {
      color: AnnotationEditor._colorManager.convert(stroke),
      opacity,
      thickness,
      paths: {
        lines,
        points,
      },
    });
    // #3116 modified by ngx-extended-pdf-viewer
    // Skip the hasEdited check when serializing a copy. Otherwise, the comment
    // would disappear from the serialized data after a save-load-save cycle.
    this.addComment(serialized, this._isCopy);
    // #3116 end of modification by ngx-extended-pdf-viewer

    if (isForCopying) {
      // #3076 modified by ngx-extended-pdf-viewer
      // When exporting (includeId=true), add ID even when copying
      // Don't add the id when copy/pasting because the pasted editor mustn't be
      // linked to an existing annotation.
      if (includeId) {
        serialized.id = this.uid;
      }
      // #3076 end of modification by ngx-extended-pdf-viewer
      serialized.isCopy = true;
      return serialized;
    }

    if (this.annotationElementId && !this.#hasElementChanged(serialized)) {
      return null;
    }

    // #3076 modified by ngx-extended-pdf-viewer
    // Use uid instead of annotationElementId to provide unique IDs for both
    // existing annotations (annotationElementId) and new annotations (this.id)
    serialized.id = this.uid;
    // #3076 end of modification by ngx-extended-pdf-viewer
    return serialized;
  }

  #hasElementChanged(serialized) {
    const { color, thickness, opacity, pageIndex } = this._initialData;
    return (
      this.hasEditedComment ||
      this._hasBeenMoved ||
      this._hasBeenResized ||
      serialized.color.some((c, i) => c !== color[i]) ||
      serialized.thickness !== thickness ||
      serialized.opacity !== opacity ||
      serialized.pageIndex !== pageIndex
    );
  }

  /** @inheritdoc */
  renderAnnotationElement(annotation) {
    if (this.deleted) {
      annotation.hide();
      return null;
    }
    const { points, rect } = this.serializeDraw(/* isForCopying = */ false);
    annotation.updateEdited({
      rect,
      thickness: this._drawingOptions["stroke-width"],
      points,
      popup: this.comment,
    });

    return null;
  }

  /**
   * Erase everything in a radius of (x,y) position.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   */
  erase(x, y, radius) {
    this.#points ||= this.serializeDraw(false).points;

    const radius2 = radius * radius;
    const newPaths = [];
    let modified = false;

    for (const path of this.#points) {
      if (path.length === 0) {
        continue;
      }
      let newPath = [];
      for (let i = 0; i < path.length; i += 2) {
        const [lx, ly] = this.#pagePointToLayer(path[i], path[i + 1]);
        const dx = lx - x;
        const dy = ly - y;
        const dist = dx * dx + dy * dy;
        if (dist >= radius2) {
          newPath.push(path[i], path[i + 1]);
        } else {
          modified = true;
          if (newPath.length >= 4) {
            newPaths.push(new Float32Array(newPath));
          }
          newPath = [];
        }
      }
      if (newPath.length >= 4) {
        newPaths.push(new Float32Array(newPath));
      }
    }

    if (modified) {
      this.#points = newPaths;
      this.#erased = true;
      // remove svg path if no points are left
      if (newPaths.length === 0) {
        this.parent.drawLayer.updateProperties(this._drawId, {
          path: { d: "" },
        });
      } else {
        const tempOutline = this.#deserializePoints();
        this.parent.drawLayer.updateProperties(this._drawId, {
          path: { d: tempOutline.toSVGPath() },
        });
      }
    }
  }

  endErase() {
    // if nothing has been erased
    if (!this.#erased) {
      return {};
    }

    // reset erased flag
    this.#erased = false;
    const oldOutline = this._drawOutlines;
    const drawingOptions = { ...this._drawingOptions };
    const undo = () => {
      this._addOutlines({
        drawOutlines: oldOutline,
        drawId: this._drawId,
        drawingOptions,
      });
    };

    if (this.#points.length === 0) {
      // The whole drawing has been erased: the editor is removed, so the
      // generic undo above (which redraws through this.parent) cannot work.
      // Re-attaching the editor is enough: #drawOutlines was never
      // overwritten in this branch, hence rebuild() restores the previous
      // drawing.
      const parent = this.parent;
      this.#points = null;
      this.remove();
      return {
        cmd: () => this.remove(),
        undo: () => {
          parent.addOrRebuild(this);
        },
      };
    }

    const newOutlines = this.#deserializePoints();
    const cmd = () =>
      this._addOutlines({
        drawOutlines: newOutlines,
        drawId: this._drawId,
        drawingOptions,
      });
    cmd();

    this.#points = null;

    return { cmd, undo };
  }

  #deserializePoints() {
    const {
      viewport: {
        rawDims: { pageWidth, pageHeight, pageX, pageY },
      },
    } = this.parent;

    const thickness = this._drawingOptions["stroke-width"];
    const rotation = this.rotation;

    const newOutline = InkEditor.deserializeDraw(
      pageX,
      pageY,
      pageWidth,
      pageHeight,
      InkEditor._INNER_MARGIN,
      {
        paths: { points: this.#points },
        rotation,
        thickness,
      }
    );

    return newOutline;
  }

  #pagePointToLayer(px, py) {
    const [pageX, pageY] = this.pageTranslation;
    const [pageW, pageH] = this.pageDimensions;
    const { width: layerW, height: layerH } =
      this.parent.div.getBoundingClientRect();

    const nx = (px - pageX) / pageW;
    const ny = (py - pageY) / pageH;

    let rx, ry;
    switch ((this.rotation || 0) % 360) {
      case 90:
        rx = ny;
        ry = 1 - nx;
        break;
      case 180:
        rx = 1 - nx;
        ry = 1 - ny;
        break;
      case 270:
        rx = 1 - ny;
        ry = nx;
        break;
      default:
        rx = nx;
        ry = ny;
        break;
    }

    const lx = rx * layerW;
    const ly = (1 - ry) * layerH;
    return [lx, ly];
  }
}

export { InkDrawingOptions, InkEditor };
