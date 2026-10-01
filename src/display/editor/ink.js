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
// stephanrauh/pdf.js#14 modified by ngx-extended-pdf-viewer - the eraser
import {
  getPathsBBox,
  makeLayerTransform,
  sweepCircleOverPaths,
} from "./eraser_utils.js";
// stephanrauh/pdf.js#14 end of modification by ngx-extended-pdf-viewer
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
  // stephanrauh/pdf.js#14 modified by ngx-extended-pdf-viewer - the eraser (mozilla/pdf.js#20227)
  #eraseSession = null;

  // An existing ink annotation (annotationElementId set) is only saved when
  // #hasElementChanged says so, and that compares color, thickness etc. but
  // not the points: a partial erase must flag the element as changed, or the
  // saved PDF keeps the original stroke.
  #hasBeenErased = false;
  // stephanrauh/pdf.js#14 end of modification by ngx-extended-pdf-viewer

  static _type = "ink";

  static _editorType = AnnotationEditorType.INK;

  static _defaultDrawingOptions = null;

  constructor(params) {
    super({ ...params, name: "inkEditor" });
    this._erasable = true; // stephanrauh/pdf.js#14 modified by ngx-extended-pdf-viewer - the eraser
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
  static createDrawerInstance({ x, y, box: [, , width, height], rotation }) {
    return new InkDrawOutliner(
      x,
      y,
      width,
      height,
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
      this.#hasBeenErased || // stephanrauh/pdf.js#14 modified by ngx-extended-pdf-viewer - the eraser
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

  // stephanrauh/pdf.js#14 modified by ngx-extended-pdf-viewer - the eraser (mozilla/pdf.js#20227)
  /** @inheritdoc */
  startErase(layerRect) {
    const { points } = this.serializeDraw(/* isForCopying = */ false);
    const transform = this.#getLayerTransform(layerRect);
    const paths = [];
    for (const path of points) {
      const len = path.length;
      if (len < 2) {
        continue;
      }
      const layerPath = new Float32Array(len);
      for (let i = 0; i < len; i += 2) {
        const [x, y] = transform.toLayer(path[i], path[i + 1]);
        layerPath[i] = x;
        layerPath[i + 1] = y;
      }
      paths.push(layerPath);
    }
    if (paths.length === 0) {
      return null;
    }

    // The eraser must react as soon as it touches the visible stroke, not only
    // when it reaches the centerline.
    const strokeRadius =
      (this._drawingOptions["stroke-width"] * this.parentScale) / 2;
    this.#eraseSession = {
      paths,
      transform,
      strokeRadius,
      modified: false,
      dirty: false,
    };
    return getPathsBBox(paths, strokeRadius);
  }

  /** @inheritdoc */
  erase(x, y, radius, prevX = x, prevY = y) {
    const session = this.#eraseSession;
    if (!session) {
      return;
    }
    const { paths, modified } = sweepCircleOverPaths(
      session.paths,
      x,
      y,
      radius + session.strokeRadius,
      prevX,
      prevY
    );
    if (modified) {
      session.paths = paths;
      session.modified = true;
      session.dirty = true;
    }
  }

  /** @inheritdoc */
  renderErase() {
    const session = this.#eraseSession;
    if (!session?.dirty || !this.parent) {
      return;
    }
    session.dirty = false;
    this.parent.drawLayer.updateProperties(this._drawId, {
      path: {
        d:
          session.paths.length === 0
            ? ""
            : this.#buildOutline(session).toSVGPath(),
      },
    });
  }

  /** @inheritdoc */
  endErase() {
    const session = this.#eraseSession;
    this.#eraseSession = null;
    if (!session?.modified) {
      return {};
    }

    const oldOutline = this._drawOutlines;
    const drawingOptions = this._drawingOptions;
    const wasErased = this.#hasBeenErased;
    const undo = () => {
      this.#hasBeenErased = wasErased;
      this._addOutlines({
        drawOutlines: oldOutline,
        drawId: this._drawId,
        drawingOptions,
      });
    };

    if (session.paths.length === 0) {
      // The whole drawing has been erased: the editor is removed, so the
      // generic undo above (which redraws through this.parent) cannot work.
      // Re-attaching the editor is enough: #drawOutlines was never
      // overwritten in this branch, hence rebuild() restores the previous
      // drawing.
      const parent = this.parent;
      this.remove();
      return {
        cmd: () => this.remove(),
        undo: () => {
          parent.addOrRebuild(this);
        },
      };
    }

    const newOutlines = this.#buildOutline(session);
    const cmd = () => {
      this.#hasBeenErased = true;
      this._addOutlines({
        drawOutlines: newOutlines,
        drawId: this._drawId,
        drawingOptions,
      });
    };
    cmd();

    return { cmd, undo };
  }

  #buildOutline({ paths, transform }) {
    const {
      viewport: {
        rawDims: { pageWidth, pageHeight, pageX, pageY },
      },
    } = this.parent;

    const points = paths.map(path => {
      const pagePath = new Float32Array(path.length);
      for (let i = 0, ii = path.length; i < ii; i += 2) {
        const [x, y] = transform.toPage(path[i], path[i + 1]);
        pagePath[i] = x;
        pagePath[i + 1] = y;
      }
      return pagePath;
    });

    return InkEditor.deserializeDraw(
      pageX,
      pageY,
      pageWidth,
      pageHeight,
      InkEditor._INNER_MARGIN,
      {
        paths: { points },
        rotation: this.rotation,
        thickness: this._drawingOptions["stroke-width"],
      }
    );
  }

  #getLayerTransform(layerRect) {
    // serializeDraw() returns canonical page coordinates whatever the
    // drawing's own rotation, so the page->layer mapping depends on the
    // current view rotation - not on this.rotation, which is the rotation
    // the drawing was created in (they differ once the user rotates).
    return makeLayerTransform(
      this.parent.viewport.rotation,
      layerRect,
      this.pageTranslation,
      this.pageDimensions
    );
  }
  // stephanrauh/pdf.js#14 end of modification by ngx-extended-pdf-viewer
}

export { InkDrawingOptions, InkEditor };
