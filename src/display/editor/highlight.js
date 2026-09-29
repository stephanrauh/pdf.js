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
import {
  FreeHighlightDrawer,
  FreeHighlightOutliner,
  HighlightOutline,
} from "./drawers/highlight.js";
// stephanrauh/pdf.js#14 modified by ngx-extended-pdf-viewer - the eraser
import {
  getPathsBBox,
  makeLayerTransform,
  sweepCircleOverPaths,
} from "./eraser_utils.js";
// stephanrauh/pdf.js#14 end of modification by ngx-extended-pdf-viewer
import {
  HighlightAnnotationElement,
  InkAnnotationElement,
} from "../annotation_layer.js";
import { AnnotationEditor } from "./editor.js";
import { ColorPicker } from "./color_picker.js";
import { KeyboardManager } from "./tools.js";
import { stopEvent } from "../display_utils.js";

class HighlightDrawingOptions extends DrawingOptions {
  constructor(properties = null) {
    super();
    super.updateProperties(properties);
  }

  /** @inheritdoc */
  updateSVGProperty(name, value) {
    if (name !== "thickness") {
      // Thickness changes free-highlight geometry, not SVG attributes.
      super.updateSVGProperty(name, value);
    }
  }

  /** @inheritdoc */
  clone() {
    const clone = new HighlightDrawingOptions();
    clone.updateAll(this);
    return clone;
  }
}

/**
 * Editor for text-selection and freehand highlights.
 * Their geometry comes from separate outline implementations.
 */
class HighlightEditor extends DrawingEditor {
  #anchorNode = null;

  #anchorOffset = 0;

  #focusNode = null;

  #focusOffset = 0;

  #methodOfCreation = "";

  #text = "";

  // stephanrauh/pdf.js#14 modified by ngx-extended-pdf-viewer - the eraser (mozilla/pdf.js#20227)
  #eraseSession = null;

  // True for a piece of a free highlight split by the eraser.
  #isErasePiece = false;

  // Suppress the focus (hence mode switch) when the eraser restores this
  // editor through undo/redo.
  #suppressFocusOnce = false;
  // stephanrauh/pdf.js#14 end of modification by ngx-extended-pdf-viewer

  static _DEFAULT_OPACITY = 1;

  static _DEFAULT_THICKNESS = 12;

  static _defaultDrawingOptions = null;

  static _type = "highlight";

  static _editorType = AnnotationEditorType.HIGHLIGHT;

  static get _keyboardManager() {
    const proto = HighlightEditor.prototype;
    return shadow(
      this,
      "_keyboardManager",
      new KeyboardManager([
        [["ArrowLeft"], proto._moveCaret, { args: [0] }],
        [["ArrowRight"], proto._moveCaret, { args: [1] }],
        [["ArrowUp"], proto._moveCaret, { args: [2] }],
        [["ArrowDown"], proto._moveCaret, { args: [3] }],
      ])
    );
  }

  constructor(params) {
    super({ ...params, name: "highlightEditor" });
    this.#anchorNode = params.anchorNode || null;
    this.#anchorOffset = params.anchorOffset || 0;
    this.#focusNode = params.focusNode || null;
    this.#focusOffset = params.focusOffset || 0;
    this.#methodOfCreation =
      params.methodOfCreation ||
      (this._drawOutlines?.isFree ? "main_toolbar" : "");
    this.#text = params.text || "";
    this._isDraggable = false;
    this.defaultL10nId = "pdfjs-editor-highlight-editor";
    this.#isErasePiece = !!params.isErasePiece; // stephanrauh/pdf.js#14 modified by ngx-extended-pdf-viewer - the eraser
    this.rotate();
    // #2256 / 2556 modified by ngx-extended-pdf-viewer
    // #3076 modified by ngx-extended-pdf-viewer - added id field
    // #3240 modified by ngx-extended-pdf-viewer - while annotations are being
    // restored, addSerializedEditor() sends the "added" event for every editor
    // type once the editor is really part of the document. Sending it here too
    // would announce a restored highlight twice.
    if (!this._uiManager?.isRestoringAnnotations) {
      this._dispatchAddedEvent();
    }
    // #2256 / 2556 end of modification by ngx-extended-pdf-viewer
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
    // Preserve user-selected defaults across initialize calls.
    this._defaultDrawingOptions ||= new HighlightDrawingOptions({
      fill: uiManager.highlightColors?.values().next().value || "#fff066",
      "fill-opacity": HighlightEditor._DEFAULT_OPACITY,
      thickness: HighlightEditor._DEFAULT_THICKNESS,
    });
  }

  /** @inheritdoc */
  static getDefaultDrawingOptions(options) {
    const clone = this._defaultDrawingOptions.clone();
    clone.updateProperties(options);
    return clone;
  }

  /** @inheritdoc */
  static get typesMap() {
    return shadow(
      this,
      "typesMap",
      new Map([
        [AnnotationEditorParamsType.HIGHLIGHT_COLOR, "fill"],
        [AnnotationEditorParamsType.HIGHLIGHT_THICKNESS, "thickness"],
      ])
    );
  }

  /** @inheritdoc */
  static get isDrawer() {
    // Free highlights start on the text layer.
    return false;
  }

  /** @inheritdoc */
  static get _hasClipPath() {
    // Clip the interactive div to the highlight shape.
    return true;
  }

  /** @inheritdoc */
  static get _hasDrawClass() {
    return false;
  }

  /** @inheritdoc */
  _addOutlines(params) {
    const { boxes, drawOutlines } = params;
    if (!boxes && !drawOutlines) {
      return;
    }
    this._drawingOptions ||=
      params.drawingOptions || HighlightEditor.getDefaultDrawingOptions();
    if (boxes) {
      params = {
        ...params,
        drawOutlines: HighlightOutline.build(
          boxes,
          this._uiManager.direction === "ltr"
        ),
      };
    }
    super._addOutlines(params);
  }

  get colorType() {
    return AnnotationEditorParamsType.HIGHLIGHT_COLOR;
  }

  get color() {
    return this._drawingOptions.fill;
  }

  get opacity() {
    return this._drawingOptions["fill-opacity"];
  }

  /** @inheritdoc */
  get _opacityName() {
    // Preserve imported opacity, which the UI doesn't expose.
    return "fill-opacity";
  }

  /** @inheritdoc */
  get _drawRotation() {
    // Text uses page coordinates; freehand uses editor rotation.
    return this._drawOutlines?.isFree ? this.rotation : 0;
  }

  /** @inheritdoc */
  get isResizable() {
    return false;
  }

  /** @inheritdoc */
  get _mustBeDisabledOnCommit() {
    return false;
  }

  /** @inheritdoc */
  get _mustFixPosition() {
    return !this._drawOutlines?.isFree;
  }

  // #3240 added by ngx-extended-pdf-viewer
  /** @inheritdoc */
  get addedEventValue() {
    // Upstream (PR 21769) moved the highlight geometry into the drawing
    // editor: #thickness now lives in _drawingOptions and #isFreeHighlight
    // is _drawOutlines.isFree. Both may be unset while the editor is still
    // being constructed, hence the optional chaining.
    return {
      color: this.color,
      thickness: this._drawingOptions?.thickness,
      isFreeHighlight: !!this._drawOutlines?.isFree,
      text: this.#text,
    };
  }
  // #3240 end of modification by ngx-extended-pdf-viewer

  /** @inheritdoc */
  get telemetryInitialData() {
    return {
      action: "added",
      type: this._drawOutlines.isFree ? "free_highlight" : "highlight",
      color: this._uiManager.getNonHCMColorName(this.color),
      thickness: this._drawingOptions.thickness,
      methodOfCreation: this.#methodOfCreation,
    };
  }

  /** @inheritdoc */
  get telemetryFinalData() {
    return {
      type: "highlight",
      color: this._uiManager.getNonHCMColorName(this.color),
    };
  }

  static computeTelemetryFinalData(data) {
    // We want to know how many colors have been used.
    return { numberOfColors: data.get("color").size };
  }

  /** @inheritdoc */
  translateInPage(x, y) {}

  /** @inheritdoc */
  get toolbarPosition() {
    return this.#relativeToBox(this._drawOutlines.focusOutline.lastPoint);
  }

  /** @inheritdoc */
  get commentButtonPosition() {
    return this.#relativeToBox(this._drawOutlines.firstPoint);
  }

  #relativeToBox([pointX, pointY]) {
    // The point and box use page coordinates.
    const [x, y, width, height] = this._drawOutlines.box;
    return [(pointX - x) / width, (pointY - y) / height];
  }

  /** @inheritdoc */
  updateParams(type, value) {
    // #2256 / #3076 modified by ngx-extended-pdf-viewer
    // Upstream (PR 21769) folded #updateColor/#updateThickness into the
    // generic DrawingEditor property update, so the ngx events are
    // dispatched here instead — same names and payload as before, and still
    // only for highlights.
    switch (type) {
      case AnnotationEditorParamsType.HIGHLIGHT_COLOR: {
        const previousValue = this.color;
        // User-selected colors use the default opacity.
        this._updateColorAndOpacity(
          value,
          HighlightEditor._DEFAULT_OPACITY,
          type
        );
        this._reportTelemetry(
          {
            action: "color_changed",
            color: this._uiManager.getNonHCMColorName(value),
          },
          /* mustWait = */ true
        );
        this._dispatchEditorEvent("colorChanged", { value, previousValue });
        break;
      }
      case AnnotationEditorParamsType.HIGHLIGHT_THICKNESS: {
        const previousValue = this._drawingOptions?.thickness;
        super.updateParams(type, value);
        this._reportTelemetry(
          { action: "thickness_changed", thickness: value },
          /* mustWait = */ true
        );
        this._dispatchEditorEvent("thicknessChanged", { value, previousValue });
        break;
      }
    }
    // #2256 / #3076 end of modification by ngx-extended-pdf-viewer
  }

  /** @inheritdoc */
  get propertiesToUpdate() {
    const properties = super.propertiesToUpdate;
    properties.push([
      AnnotationEditorParamsType.HIGHLIGHT_FREE,
      this._drawOutlines.isFree,
    ]);
    return properties;
  }

  /** @inheritdoc */
  get toolbarButtons() {
    if (this._uiManager.highlightColors) {
      // The toolbar destroys its picker, so rebuild it with the toolbar.
      this._colorPicker = new ColorPicker({ editor: this });
      return [["colorPicker", this._colorPicker]];
    }
    return super.toolbarButtons;
  }

  /** @inheritdoc */
  fixAndSetPosition() {
    return super.fixAndSetPosition(this._drawRotation);
  }

  /** @inheritdoc */
  getRect(tx, ty) {
    return super.getRect(tx, ty, this._drawRotation);
  }

  /** @inheritdoc */
  onceAdded(focus) {
    // stephanrauh/pdf.js#14 modified by ngx-extended-pdf-viewer - the eraser
    if (this.#isErasePiece) {
      // The eraser step owns the undo of the pieces it creates, and a new
      // piece must not steal the focus (that would leave the eraser mode).
      return;
    }
    if (this.#suppressFocusOnce) {
      // Restored by the eraser through undo/redo: keep the current mode by
      // not focusing (focusing would select the highlight and switch mode).
      this.#suppressFocusOnce = false;
      focus = false;
    }
    // stephanrauh/pdf.js#14 end of modification by ngx-extended-pdf-viewer
    if (!this.annotationElementId) {
      this.parent.addUndoableEditor(this);
    }
    if (focus) {
      this.div.focus();
    }
  }

  /** @inheritdoc */
  remove() {
    this._reportTelemetry({
      action: "deleted",
    });
    super.remove();
  }

  // stephanrauh/pdf.js#14 modified by ngx-extended-pdf-viewer - the eraser (mozilla/pdf.js#20227)
  /** @inheritdoc */
  get erasable() {
    // Only drawings can be erased: a free (drawn) highlight is, a text
    // (selection) highlight isn't.
    return !!this._drawOutlines?.isFree;
  }

  /** @inheritdoc */
  startErase(layerRect) {
    if (!this._drawOutlines?.isFree) {
      return null;
    }
    // The serialized points are in PDF page coordinates (one continuous
    // stroke for a free highlight); map them to layer pixels in the current
    // view frame, exactly like the ink editor does.
    const rect = this.getRect(0, 0);
    // The free-highlight outline stores points in the canonical (unrotated)
    // page frame; the view rotation is applied by the draw layer. Serialize
    // canonically and fold the view rotation into the page<->layer transform.
    const viewRotation = this.parent.viewport.rotation;
    const { points } = this._drawOutlines.serialize(rect, 0);
    const transform = makeLayerTransform(
      viewRotation,
      layerRect,
      this.pageTranslation,
      this.pageDimensions
    );
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

    // The eraser must react as soon as it touches the visible highlight.
    const strokeRadius =
      (this._drawingOptions.thickness / 2) * this.parentScale;
    this.#eraseSession = {
      paths,
      layerW: layerRect.width,
      layerH: layerRect.height,
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
    // Preview: paint the remaining pieces the way a live drawing does - the
    // (unfinalized) outliner emits coordinates over the whole layer, so the box
    // is the full layer and the view rotation is already baked into the points
    // (hence data-main-rotation 0). Finalizing to a tight box waits for commit.
    const d = this.#buildEraseOutliners(session)
      .map(outliner => outliner.toSVGPath())
      .join(" ");
    this.parent.drawLayer.updateProperties(this._drawId, {
      bbox: [0, 0, 1, 1],
      root: { "data-main-rotation": 0 },
      path: { d },
    });
  }

  /** @inheritdoc */
  endErase() {
    const session = this.#eraseSession;
    this.#eraseSession = null;
    if (!session?.modified) {
      return {};
    }

    // A free highlight is a single continuous stroke, so a cut yields several
    // disjoint pieces. Rebuild each as a fresh highlight editor and drop the
    // original; undo restores the original and removes the pieces.
    const parent = this.parent;
    const outlines = this.#buildEraseOutliners(session).map(outliner =>
      this.#finalizeEraseOutline(outliner)
    );
    let pieces = null;

    const cmd = () => {
      this.remove();
      if (pieces) {
        for (const piece of pieces) {
          this._uiManager.rebuild(piece);
        }
      } else {
        pieces = outlines.map(outline => this.#spawnPiece(parent, outline));
      }
    };
    const undo = () => {
      if (pieces) {
        for (const piece of pieces) {
          piece.remove();
        }
      }
      this.#suppressFocusOnce = true;
      parent.addOrRebuild(this);
    };
    cmd();

    return { cmd, undo };
  }

  /**
   * Build one (unfinalized) FreeHighlightOutliner per remaining piece of the
   * erase session, in the current-view layer frame - the same recipe a live
   * highlight drawing uses (see createDrawerInstance). Pieces too short to form
   * a stroke are dropped.
   * @returns {Array<FreeHighlightOutliner>}
   */
  #buildEraseOutliners({ paths, layerW, layerH }) {
    const box = [0, 0, layerW, layerH];
    const halfThickness = this._drawingOptions.thickness / 2;
    const isLTR = this._uiManager.direction === "ltr";
    const scale = this.parentScale;
    const outliners = [];
    for (const path of paths) {
      if (path.length < 4) {
        continue;
      }
      const outliner = new FreeHighlightOutliner(
        path[0],
        path[1],
        box,
        scale,
        halfThickness,
        isLTR,
        /* innerMargin = */ 0.001
      );
      for (let i = 2, ii = path.length; i < ii; i += 2) {
        outliner.add(path[i], path[i + 1]);
      }
      if (!outliner.isEmpty()) {
        outliners.push(outliner);
      }
    }
    return outliners;
  }

  /** Finalize an erase outliner into a highlight outline (with focus). */
  #finalizeEraseOutline(outliner) {
    const outline = outliner.getOutlines();
    outline.buildFocusOutline(this._drawingOptions.thickness);
    return outline;
  }

  /**
   * Create a new free highlight editor for a piece split off by the eraser.
   */
  #spawnPiece(parent, drawOutlines) {
    const piece = new HighlightEditor({
      parent,
      id: this._uiManager.getId(),
      uiManager: this._uiManager,
      eventBus: this.eventBus,
      x: 0,
      y: 0,
      isCentered: false,
      drawOutlines,
      drawingOptions: this._drawingOptions.clone(),
      isErasePiece: true,
    });
    parent.add(piece);
    return piece;
  }
  // stephanrauh/pdf.js#14 end of modification by ngx-extended-pdf-viewer

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    const div = super.render();
    if (this.#text) {
      div.setAttribute("aria-label", this.#text);
      div.setAttribute("role", "mark");
    }
    if (this._drawOutlines.isFree) {
      div.classList.add("free");
    } else {
      div.addEventListener("keydown", this.#keydown.bind(this), {
        signal: this._uiManager._signal,
      });
    }
    this.enableEditing();

    return div;
  }

  #keydown(event) {
    HighlightEditor._keyboardManager.exec(this, event);
  }

  _moveCaret(direction) {
    this.parent.unselect(this);
    switch (direction) {
      case 0 /* left */:
      case 2 /* up */:
        this.#setCaret(/* start = */ true);
        break;
      case 1 /* right */:
      case 3 /* down */:
        this.#setCaret(/* start = */ false);
        break;
    }
  }

  #setCaret(start) {
    if (!this.#anchorNode) {
      return;
    }
    const selection = window.getSelection();
    if (start) {
      selection.setPosition(this.#anchorNode, this.#anchorOffset);
    } else {
      selection.setPosition(this.#focusNode, this.#focusOffset);
    }
  }

  /** @inheritdoc */
  unselect() {
    super.unselect();
    if (!this._drawOutlines.isFree) {
      this.#setCaret(/* start = */ false);
    }
  }

  /** @inheritdoc */
  static createDrawerInstance({ x, y, box, parent, isLTR }) {
    // The outliner spreads the stroke on both sides of the pointer path, hence
    // it takes the half-thickness. The inner margin slightly inflates the
    // bounding box, else the shape would be clipped by its own SVG viewport.
    return new FreeHighlightDrawer(
      x,
      y,
      box,
      parent.scale,
      this._defaultDrawingOptions.thickness / 2,
      isLTR,
      /* innerMargin = */ 0.001
    );
  }

  /** @inheritdoc */
  static _getDrawingTarget(parent, { target }) {
    // The event target can be a child of the text layer.
    return target.closest(".textLayer");
  }

  /** @inheritdoc */
  static _getPointerCoords({ x, y }) {
    // Child-relative offsets don't match the text layer's client box.
    return [x, y];
  }

  /** @inheritdoc */
  static _addDrawingListeners(target, signal) {
    // Highlights bypass AnnotationEditorLayer.startDrawingSession.
    target.classList.add("free");
    signal.addEventListener("abort", () => target.classList.remove("free"), {
      once: true,
    });
    window.addEventListener("blur", () => this._endDraw(null), { signal });
    window.addEventListener(
      "pointerdown",
      stopEvent /* Prevent pointerdown from reaching page content. */,
      {
        capture: true,
        passive: false,
        signal,
      }
    );
  }

  /** @inheritdoc */
  static _endDrawingSession(isAborted = false) {
    return this.endDrawing(isAborted);
  }

  /** @inheritdoc */
  createDrawingOptions({ color, opacity, thickness }) {
    const { _defaultDrawingOptions: defaults, _DEFAULT_OPACITY } =
      HighlightEditor;
    this._drawingOptions = HighlightEditor.getDefaultDrawingOptions({
      fill: Util.makeHexColor(...color),
      "fill-opacity": opacity || _DEFAULT_OPACITY,
      thickness: thickness || defaults.thickness,
    });
  }

  /** @inheritdoc */
  static deserializeDraw(
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    _innerMargin,
    data,
    uiManager
  ) {
    const { quadPoints } = data;
    if (quadPoints) {
      const boxes = [];
      for (let i = 0, ii = quadPoints.length; i < ii; i += 8) {
        boxes.push({
          x: (quadPoints[i] - pageX) / pageWidth,
          y: 1 - (quadPoints[i + 1] - pageY) / pageHeight,
          width: (quadPoints[i + 2] - quadPoints[i]) / pageWidth,
          height: (quadPoints[i + 1] - quadPoints[i + 5]) / pageHeight,
        });
      }
      return HighlightOutline.build(boxes, uiManager.direction === "ltr");
    }

    const thickness = data.thickness || this._defaultDrawingOptions.thickness;
    const points = (data.inkLists || data.outlines.points)[0];
    // As in `createDrawerInstance`, the outliner takes the half-thickness and a
    // non-null inner margin.
    const outliner = new FreeHighlightOutliner(
      points[0] - pageX,
      pageHeight - (points[1] - pageY),
      [0, 0, pageWidth, pageHeight],
      1,
      thickness / 2,
      true,
      /* innerMargin = */ 0.001
    );
    for (let i = 0, ii = points.length; i < ii; i += 2) {
      outliner.add(points[i] - pageX, pageHeight - (points[i + 1] - pageY));
    }
    const outlines = outliner.getOutlines();
    outlines.buildFocusOutline(thickness);

    return outlines;
  }

  /** @inheritdoc */
  static async deserialize(data, parent, uiManager) {
    let initialData = null;
    if (data instanceof HighlightAnnotationElement) {
      const {
        data: {
          quadPoints,
          rect,
          rotation,
          id,
          color,
          opacity,
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
        annotationType: AnnotationEditorType.HIGHLIGHT,
        color: Array.from(color),
        opacity,
        quadPoints,
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
    } else if (data.annotationType && data.annotationType === AnnotationEditorType.HIGHLIGHT) {
      // eslint-disable-next-line prefer-const
      // #3113 modified by ngx-extended-pdf-viewer
      // Extract popup object from data to deserialize comment information
      let { quadPoints, outlines, rect, rotation, id, color, opacity, popup, popupRef, pageIndex, thickness } = data;

      // Ensure quadPoints is an array
      if (quadPoints) {
        if (!Array.isArray(quadPoints)) {
          quadPoints = Object.values(quadPoints);
        }
      }

      let inkLists;
      if (!quadPoints && outlines) {
        if (Array.isArray(outlines)) {
          // 'outlines' is an array of arrays
          inkLists = outlines.map(subArray => subArray);
        } else if (typeof outlines === "object" && outlines.points) {
          // 'outlines' is an object with 'points' property
          inkLists = [outlines.points.flat()];
        } else {
          // Handle unexpected format
          console.error("Unexpected outlines format");
          return null;
        }
        thickness = thickness || data.thickness || 1;
      }

      initialData = data = {
        annotationType: AnnotationEditorType.HIGHLIGHT,
        color: Array.from(color),
        opacity,
        quadPoints,
        inkLists,
        thickness,
        boxes: null,
        pageIndex,
        rect: rect.slice(0),
        rotation,
        id,
        deleted: false,
        // #3237 modified by ngx-extended-pdf-viewer
        // This branch builds a fresh object instead of spreading `data`, so two
        // fields the base class reads were silently dropped for highlights:
        // `isCopy` (without it the restored comment is missing from the next
        // getSerializedAnnotations()) and the stable `customId` of #3225.
        isCopy: data.isCopy,
        customId: data.customId,
        // #3237 end of modification by ngx-extended-pdf-viewer
        // #3113 modified by ngx-extended-pdf-viewer
        // Extract comment data from popup annotation for deserialization
        popupRef: popupRef || !!(popup && popup.contents && !popup.deleted) || null,
        comment: (!popup?.deleted && popup?.contents) || null,
        commentDate: (!popup?.deleted && popup?.date) || null,
        // #3113 end of modification by ngx-extended-pdf-viewer
      };
      // #3113 end of modification by ngx-extended-pdf-viewer (this whole
      // `else if` branch deserializes the plain objects that
      // addEditorAnnotation() takes; Mozilla only deserializes annotations
      // that came out of a PDF file)
    } else if (data instanceof InkAnnotationElement) {
      const {
        data: {
          inkLists,
          rect,
          rotation,
          id,
          color,
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
        annotationType: AnnotationEditorType.HIGHLIGHT,
        color: Array.from(color),
        thickness,
        inkLists,
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
    }

    const editor = await super.deserialize(data, parent, uiManager);
    editor._initialData = initialData;
    if (data.comment) {
      editor.setCommentData(data);
    }

    return editor;
  }

  /** @inheritdoc */
  serialize(isForCopying = false, context = null, includeId = false) {
    // #3076 modified by ngx-extended-pdf-viewer
    // It doesn't make sense to copy/paste a highlight annotation, unless we're exporting
    if (this.isEmpty() || (isForCopying && !includeId)) {
      return null;
    }
    // #3076 end of modification by ngx-extended-pdf-viewer

    if (this.deleted) {
      return this.serializeDeleted();
    }

    // #3076 modified by ngx-extended-pdf-viewer - pass the export context
    const serialized = super.serialize(isForCopying, context);
    // #3076 end of modification by ngx-extended-pdf-viewer
    Object.assign(serialized, {
      color: AnnotationEditor._colorManager.convert(
        this._uiManager.getNonHCMColor(this.color)
      ),
      opacity: this.opacity,
      thickness: this._drawingOptions.thickness,
      quadPoints: this._drawOutlines.serializeQuadPoints(
        this.pageTranslation,
        this.pageDimensions
      ),
      outlines: this._drawOutlines.serialize(
        serialized.rect,
        this._drawRotation
      ),
    });
    // #3116 modified by ngx-extended-pdf-viewer
    // Skip the hasEdited check when serializing a copy. Otherwise, the comment
    // would disappear from the serialized data after a save-load-save cycle.
    this.addComment(serialized, this._isCopy);
    // #3116 end of modification by ngx-extended-pdf-viewer

    // #3076 modified by ngx-extended-pdf-viewer
    // When exporting with includeId=true, add ID even when isForCopying=true
    if (isForCopying && includeId) {
      serialized.id = this.uid;
      serialized.isCopy = true;
      return serialized;
    }
    // #3076 end of modification by ngx-extended-pdf-viewer

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
    const { color } = this._initialData;
    return (
      this.hasEditedComment || serialized.color.some((c, i) => c !== color[i])
    );
  }

  /** @inheritdoc */
  renderAnnotationElement(annotation) {
    if (this.deleted) {
      annotation.hide();
      return null;
    }
    annotation.updateEdited({
      rect: this.getPDFRect(),
      popup: this.comment,
    });

    return null;
  }
}

export { HighlightEditor };
