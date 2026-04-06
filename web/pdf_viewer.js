/* Copyright 2014 Mozilla Foundation
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

/** @typedef {import("../src/display/api").PDFDocumentProxy} PDFDocumentProxy */
/** @typedef {import("../src/display/api").PDFPageProxy} PDFPageProxy */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/display_utils").PageViewport} PageViewport */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/optional_content_config").OptionalContentConfig} OptionalContentConfig */
/** @typedef {import("./event_utils").EventBus} EventBus */
// eslint-disable-next-line max-len
/** @typedef {import("./pdf_find_controller").PDFFindController} PDFFindController */
// eslint-disable-next-line max-len
/** @typedef {import("./pdf_scripting_manager").PDFScriptingManager} PDFScriptingManager */
/** @typedef {import("./pdf_link_service.js").PDFLinkService} PDFLinkService */
// eslint-disable-next-line max-len
/** @typedef {import("./base_download_manager.js").BaseDownloadManager} BaseDownloadManager */
/** @typedef {import("./l10n.js").L10n} L10n */


import {
  AnnotationEditorType,
  AnnotationEditorUIManager,
  AnnotationMode,
  makeArr,
  MathClamp,
  PermissionFlag,
  PixelsPerInch,
  shadow,
  stopEvent,
  version,
} from "pdfjs-lib";
import {
  DEFAULT_SCALE,
  DEFAULT_SCALE_DELTA,
  DEFAULT_SCALE_VALUE,
  docStyle,
  getVisibleElements,
  isPortraitOrientation,
  isValidRotation,
  isValidScrollMode,
  isValidSpreadMode,
  MAX_AUTO_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  PresentationModeState,
  removeNullCharacters,
  SCROLLBAR_PADDING,
  scrollIntoView,
  ScrollMode,
  SpreadMode,
  TextLayerMode,
  UNKNOWN_SCALE,
  VERTICAL_PADDING,
  watchScroll,
} from "./ui_utils.js";
import { GenericL10n } from "web-null_l10n";
import { NgxConsole } from "../external/ngx-logger/ngx-console.js";
import { PageFlip } from "./page-flip.module.js"; // #716 modified by ngx-extended-pdf-viewer
import { PDFPageView } from "./pdf_page_view.js";
import { PDFRenderingQueue } from "./pdf_rendering_queue.js";
import { RenderingStates } from "./renderable_view.js";
import { SimpleLinkService } from "./pdf_link_service.js";

const DEFAULT_CACHE_SIZE = 10;

const PagesCountLimit = {
  FORCE_SCROLL_MODE_PAGE: 10000,
  FORCE_LAZY_PAGE_INIT: 5000,
  PAUSE_EAGER_PAGE_INIT: 250,
};

function isValidAnnotationEditorMode(mode) {
  return (
    Object.values(AnnotationEditorType).includes(mode) &&
    mode !== AnnotationEditorType.DISABLE
  );
}

/**
 * @typedef {Object} PDFViewerOptions
 * @property {HTMLDivElement} container - The container for the viewer element.
 * @property {HTMLDivElement} [viewer] - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {PDFLinkService} [linkService] - The navigation/linking service.
 * @property {BaseDownloadManager} [downloadManager] - The download manager
 *   component.
 * @property {PDFFindController} [findController] - The find controller
 *   component.
 * @property {PDFScriptingManager} [scriptingManager] - The scripting manager
 *   component.
 * @property {PDFRenderingQueue} [renderingQueue] - The rendering queue object.
 * @property {boolean} [removePageBorders] - Removes the border shadow around
 *   the pages. The default value is `false`.
 * @property {number} [textLayerMode] - Controls if the text layer used for
 *   selection and searching is created. The constants from {TextLayerMode}
 *   should be used. The default value is `TextLayerMode.ENABLE`.
 * @property {number} [annotationMode] - Controls if the annotation layer is
 *   created, and if interactive form elements or `AnnotationStorage`-data are
 *   being rendered. The constants from {@link AnnotationMode} should be used;
 *   see also {@link RenderParameters} and {@link GetOperatorListParameters}.
 *   The default value is `AnnotationMode.ENABLE_FORMS`.
 * @property {number} [annotationEditorMode] - Enables the creation and editing
 *   of new Annotations. The constants from {@link AnnotationEditorType} should
 *   be used. The default value is `AnnotationEditorType.NONE`.
 * @property {string} [annotationEditorHighlightColors] - A comma separated list
 *   of colors to propose to highlight some text in the pdf.
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   mainly for annotation icons. Include trailing slash.
 * @property {boolean} [enablePrintAutoRotate] - Enables automatic rotation of
 *   landscape pages upon printing. The default is `false`.
 * @property {number} [maxCanvasPixels] - The maximum supported canvas size in
 *   total pixels, i.e. width * height. Use `-1` for no limit, or `0` for
 *   CSS-only zooming. The default value is 4096 * 8192 (32 mega-pixels).
 * @property {number} [maxCanvasDim] - The maximum supported canvas dimension,
 *   in either width or height. Use `-1` for no limit.
 *   The default value is 32767.
 * @property {number} [capCanvasAreaFactor] - Cap the canvas area to the
 *   viewport increased by the value in percent. Use `-1` for no limit.
 *   The default value is 200%.
 * @property {boolean} [enableDetailCanvas] - When enabled, if the rendered
 *   pages would need a canvas that is larger than `maxCanvasPixels` or
 *   `maxCanvasDim`, it will draw a second canvas on top of the CSS-zoomed one,
 *   that only renders the part of the page that is close to the viewport.
 *   The default value is `true`.
 * @property {number} [imagesRightClickMinSize] - All images whose width and
 *  height are at least this value (in pixels) will be lazily inserted in the
 *  dom to allow right-clicking and saving them. Use `-1` to disable this.
 * @property {boolean} [enableOptimizedPartialRendering] - When enabled, PDF
 *   rendering will keep track of which areas of the page each PDF operation
 *   affects. Then, when rendering a partial page (if `enableDetailCanvas` is
 *   enabled), it will only run through the operations that affect that portion.
 * @property {L10n} [l10n] - Localization service.
 * @property {boolean} [enablePermissions] - Enables PDF document permissions,
 *   when they exist. The default value is `false`.
 * @property {Object} [pageColors] - Overwrites background and foreground colors
 *   with user defined ones in order to improve readability in high contrast
 *   mode.
 * @property {boolean} [supportsPinchToZoom] - Enable zooming on pinch gesture.
 *   The default value is `true`.
 * @property {boolean} [enableAutoLinking] - Enable creation of hyperlinks from
 *   text that look like URLs. The default value is `true`.
 * @property {number} [minDurationToUpdateCanvas] - Minimum duration to wait
 *   before updating the canvas. The default value is `500`.
 */

class PDFPageViewBuffer {
  // Here we rely on the fact that `Set`s preserve the insertion order.
  #buf = new Set();

  #size = 0;

  constructor(size) {
    this.#size = size;
  }

  push(view) {
    const buf = this.#buf;
    if (buf.has(view)) {
      buf.delete(view); // Move the view to the "end" of the buffer.
    }
    buf.add(view);

    if (buf.size > this.#size) {
      this.#destroyFirstView();
    }
  }

  /**
   * After calling resize, the size of the buffer will be `newSize`.
   * The optional parameter `idsToKeep` is, if present, a Set of page-ids to
   * push to the back of the buffer, delaying their destruction. The size of
   * `idsToKeep` has no impact on the final size of the buffer; if `idsToKeep`
   * is larger than `newSize`, some of those pages will be destroyed anyway.
   */
  resize(newSize, idsToKeep = null) {
    this.#size = newSize;

    const buf = this.#buf;
    if (idsToKeep) {
      const ii = buf.size;
      let i = 1;
      for (const view of buf) {
        if (idsToKeep.has(view.id)) {
          buf.delete(view); // Move the view to the "end" of the buffer.
          buf.add(view);
        }
        if (++i > ii) {
          break;
        }
      }
    }

    while (buf.size > this.#size) {
      this.#destroyFirstView();
    }
  }

  has(view) {
    return this.#buf.has(view);
  }

  [Symbol.iterator]() {
    return this.#buf.keys();
  }

  #destroyFirstView() {
    const firstView = this.#buf.keys().next().value;

    firstView?.destroy();
    this.#buf.delete(firstView);
  }
}

/**
 * Simple viewer control to display PDF content/pages.
 */
class PDFViewer {
  #buffer = null;

  #altTextManager = null;

  #annotationEditorHighlightColors = null;

  #annotationEditorMode = AnnotationEditorType.NONE;

  #annotationEditorUIManager = null;

  #annotationMode = AnnotationMode.ENABLE_FORMS;

  #commentManager = null;

  #containerTopLeft = null;

  #editorUndoBar = null;

  #enableHighlightFloatingButton = false;

  #enablePermissions = false;

  #enableUpdatedAddImage = false;

  #enableNewAltTextWhenAddingImage = false;

  #enableAutoLinking = true;

  #abortSignal = null;

  #eventAbortController = null;

  #minDurationToUpdateCanvas = 0;

  #mlManager = null;

  #printingAllowed = true;

  #scrollTimeoutId = null;

  #switchAnnotationEditorModeAC = null;

  #switchAnnotationEditorModeTimeoutId = null;

  #copyAllInProgress = false;

  #hiddenCopyElement = null;

  #previousContainerHeight = 0;

  #resizeObserver = new ResizeObserver(this.#resizeObserverCallback.bind(this));

  #scrollModePageState = null;

  #scaleTimeoutId = null;

  // #3069 modified by ngx-extended-pdf-viewer
  // Frozen copy of _location captured at the start of a pinch/wheel zoom
  // gesture. During the gesture, scroll events fire _scrollUpdate() →
  // update() → _updateLocation(), which overwrites _location with the
  // current (drifted) scroll position. Using this drifted _location in
  // scrollPageIntoView() causes cumulative drift. By freezing the location
  // at gesture start and reusing it for every frame, the scroll correction
  // targets the same position throughout the gesture.
  #frozenLocation = null;
  #frozenScale = null;
  // #3069 end of modification by ngx-extended-pdf-viewer

  #signatureManager = null;

  #supportsPinchToZoom = true;

  #textLayerMode = TextLayerMode.ENABLE;

  // #1989 modified by ngx-extended-pdf-viewer
  // to ensure rendering in infinite-scroll-mode
  #outerScrollContainer = undefined;

  // #3069: Timestamp of last programmatic navigation. Used to suppress
  // page-number resets in update() while the scroll is still settling.
  #lastNavigationTime = 0;

  #pageViewMode = "multiple";
  // #1989 end of modification by ngx-extended-pdf-viewer

  // #2459 modified by ngx-extended-pdf-viewer
  #maxZoom = MAX_SCALE;

  #minZoom = MIN_SCALE;
  // #2459 end of modification by ngx-extended-pdf-viewer

  #viewerAlert = null;

  #copiedPageViews = null;

  #savedPageViews = null;

  #deletedPageNumbers = null;

  /**
   * @param {PDFViewerOptions} options
   */
  constructor(options) {
    const viewerVersion =
      typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_VERSION") : null;
    if (version !== viewerVersion) {
      throw new Error(
        `The API version "${version}" does not match the Viewer version "${viewerVersion}".`
      );
    }

    this.container = options.container;
    this.viewer = options.viewer || options.container.firstElementChild;
    this.#viewerAlert = options.viewerAlert || null;

    /** #2784 modified by ngx-extended-pdf-viewer */
    this.eventBus = options.eventBus;
    /** #2784 end of modification by ngx-extended-pdf-viewer */
    /** #495 modified by ngx-extended-pdf-viewer */
    this.pageViewMode = options.pageViewMode || "multiple";
    /** end of modification */
    // #2459 modified by ngx-extended-pdf-viewer
    this.defaultCacheSize = options.defaultCacheSize;
    this.#maxZoom = options.maxZoom;
    this.#minZoom = options.minZoom;
    // #2459 end of modification

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      if (this.container?.tagName !== "DIV" || this.viewer?.tagName !== "DIV") {
        throw new Error("Invalid `container` and/or `viewer` option.");
      }

      if (
        this.container.offsetParent &&
        getComputedStyle(this.container).position !== "absolute"
      ) {
        throw new Error("The `container` must be absolutely positioned.");
      }
    }
    this.#resizeObserver.observe(this.container);

    this.linkService = options.linkService || new SimpleLinkService();
    this.downloadManager = options.downloadManager || null;
    this.findController = options.findController || null;
    this.customFindController = options.customFindController || null;
    this.#altTextManager = options.altTextManager || null;
    this.#commentManager = options.commentManager || null;
    this.#signatureManager = options.signatureManager || null;
    this.#editorUndoBar = options.editorUndoBar || null;

    if (this.findController) {
      this.findController.onIsPageVisible = pageNumber =>
        this._getVisiblePages().ids.has(pageNumber);
    }
    this._scriptingManager = options.scriptingManager || null;
    this.#textLayerMode = options.textLayerMode ?? TextLayerMode.ENABLE;
    this.#annotationMode =
      options.annotationMode ?? AnnotationMode.ENABLE_FORMS;
    this.#annotationEditorMode =
      options.annotationEditorMode ?? AnnotationEditorType.NONE;
    this.#annotationEditorHighlightColors =
      options.annotationEditorHighlightColors || null;
    this.#enableHighlightFloatingButton =
      options.enableHighlightFloatingButton === true;
    this.#enableUpdatedAddImage = options.enableUpdatedAddImage === true;
    this.#enableNewAltTextWhenAddingImage =
      options.enableNewAltTextWhenAddingImage === true;
    this.imageResourcesPath = options.imageResourcesPath || "";
    this.enablePrintAutoRotate = options.enablePrintAutoRotate || false;
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      this.removePageBorders = options.removePageBorders || false;
    }
    this.maxCanvasPixels = options.maxCanvasPixels;
    this.maxCanvasDim = options.maxCanvasDim;
    this.capCanvasAreaFactor = options.capCanvasAreaFactor;
    this.enableDetailCanvas = options.enableDetailCanvas ?? true;
    this.enableOptimizedPartialRendering =
      options.enableOptimizedPartialRendering ?? false;
    this.imagesRightClickMinSize = options.imagesRightClickMinSize ?? -1;
    this.l10n = options.l10n;
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      this.l10n ||= new GenericL10n();
    }
    this.#enablePermissions = options.enablePermissions || false;
    this.pageColors = options.pageColors || null;
    this.#mlManager = options.mlManager || null;
    this.#supportsPinchToZoom = options.supportsPinchToZoom !== false;
    this.#enableAutoLinking = options.enableAutoLinking !== false;
    this.#minDurationToUpdateCanvas = options.minDurationToUpdateCanvas ?? 500;

    this.defaultRenderingQueue = !options.renderingQueue;
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
      this.defaultRenderingQueue
    ) {
      // Custom rendering queue is not specified, using default one
      this.renderingQueue = new PDFRenderingQueue();
      this.renderingQueue.setViewer(this);
    } else {
      this.renderingQueue = options.renderingQueue;
    }

    const { abortSignal } = options;
    this.#abortSignal = abortSignal || null;
    abortSignal?.addEventListener(
      "abort",
      () => {
        this.#resizeObserver.disconnect();
        this.#resizeObserver = null;
      },
      { once: true }
    );

    this.scroll = watchScroll(
      this.container,
      this._scrollUpdate.bind(this),
      abortSignal
    );
    this.presentationModeState = PresentationModeState.UNKNOWN;
    this._resetView();

    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
      this.removePageBorders
    ) {
      this.viewer.classList.add("removePageBorders");
    }

    this.#updateContainerHeightCss();

    // Trigger API-cleanup, once thumbnail rendering has finished,
    // if the relevant pageView is *not* cached in the buffer.
    this.eventBus._on("thumbnailrendered", ({ pageNumber, pdfPage }) => {
      const pageView = this._pages[pageNumber - 1];
      if (!this.#buffer.has(pageView)) {
        pdfPage?.cleanup();
      }
    });

    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
      !options.l10n
    ) {
      // Ensure that Fluent is connected in e.g. the COMPONENTS build.
      this.l10n.translate(this.container);
    }
    this.cspPolicyService = options.cspPolicyService; // #2362 modified by ngx-extended-pdf-viewer
  }

  // #2459 modified by ngx-extended-pdf-viewer
  get maxZoom() {
    return this.#maxZoom;
  }

  set maxZoom(value) {
    this.#maxZoom = value;
  }

  get minZoom() {
    return this.#minZoom;
  }

  set minZoom(value) {
    this.#minZoom = value;
  }
  // #2459 end of modification by ngx-extended-pdf-viewer

  // #2337 modified by ngx-extended-pdf-viewer:
  // allow textlayer to be activated in an existing viewer
  setTextLayerMode(mode) {
    this.#textLayerMode = mode;
  }
  // #2337 end of modification by ngx-extended-pdf-viewer

  // #1989 modified by ngx-extended-pdf-viewer
  // to ensure rendering in infinite-scroll-mode

  get pageViewMode() {
    return this.#pageViewMode;
  }

  set pageViewMode(viewMode) {
    if (this.#pageViewMode !== viewMode) {
      // #3069 modified by ngx-extended-pdf-viewer
      // Save the current page before switching modes so we can restore
      // the scroll position after the layout changes.
      const previousPage = this._currentPageNumber;
      // #3069 end of modification by ngx-extended-pdf-viewer

      this.#pageViewMode = viewMode;
      // Clear cached scroll container — the viewerContainer itself may
      // have been cached from the previous mode when it had a scrollbar.
      this.#outerScrollContainer = undefined;
      if (viewMode === "infinite-scroll") {
        this.#initOuterScrollListener();
      }

      // #2503 modified by ngx-extended-pdf-viewer: inform the find controller about changes of the pageViewMode
      this.eventBus.dispatch("pageviewmodechanged", { source: this, pageViewMode: viewMode });
      // #2503 end of modification by ngx-extended-pdf-viewer

      // #3069 modified by ngx-extended-pdf-viewer
      // After switching to infinite-scroll, the viewerContainer expands
      // and update() would reset the page to 1. Prevent this by setting
      // the navigation guard and scrolling to the previously visible page.
      if (viewMode === "infinite-scroll" && previousPage > 1) {
        this.#lastNavigationTime = Date.now();
        // Use a longer delay to ensure the layout has settled and
        // <main> has its scrollbar before we try to scroll.
        setTimeout(() => {
          this.#lastNavigationTime = Date.now();
          this.#scrollIntoView(this._pages[previousPage - 1]);
        }, 200);
      }
      // #3069 end of modification by ngx-extended-pdf-viewer
    }
  }

  #findParentWithScrollbar(element) {
    while (element) {
      if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  // Walk up from an element via parentElement to find the nearest ancestor
  // with a REAL scrollbar (scrollHeight > clientHeight, meaning content is
  // clipped and scrollable). Skips the container itself and body/html.
  #findAncestorWithScrollbar(element) {
    // Start above the container — the container itself expands in
    // infinite-scroll mode (no scrollbar), so we must skip it.
    let el = element?.parentElement;
    while (el) {
      if (el === document.body || el === document.documentElement) {
        return null; // use window fallback
      }
      // Only consider elements that actually clip their content
      // (overflow auto/scroll with content overflowing).
      const style = getComputedStyle(el);
      const overflowY = style.overflowY;
      const hasOverflowClip = overflowY === "auto" || overflowY === "scroll";
      if (hasOverflowClip && el.scrollHeight > el.clientHeight) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  #outerScrollListenerActive = false;

  #initOuterScrollListener() {
    if (this.#outerScrollListenerActive) {
      return;
    }
    this.#outerScrollListenerActive = true;
    // Use a capturing scroll listener on the document to catch scroll
    // events from ANY ancestor element (could be <main>, a custom
    // container, <body>, or the window). This avoids the fragile approach
    // of trying to find the specific scrollable ancestor at init time,
    // which fails when the DOM isn't fully laid out yet.
    document.addEventListener("scroll", (evt) => {
      // Only react if the scroll target is an ancestor of our container.
      const target = evt.target;
      if (target === document || target === document.documentElement ||
          target === document.body || target?.contains?.(this.container)) {
        this._scrollUpdate();
      }
    }, { capture: true });
    // Also listen for window scroll (for body/html scrolling).
    window.addEventListener("scroll", () => this._scrollUpdate());
  }
  // #1989 end of modification by ngx-extended-pdf-viewer


  get printingAllowed() {
    return this.#printingAllowed;
  }

  get pagesCount() {
    return this._pages.length;
  }

  getPageView(index) {
    return this._pages[index];
  }

  // #2943 modified by ngx-extended-pdf-viewer
  swapPages(oldIndex, newIndex) {
    const oldIndexPage = this._pages[oldIndex].pdfPage;
    const newIndexPage = this._pages[newIndex].pdfPage;
    this._pages[oldIndex].setPdfPage(newIndexPage);
    this._pages[newIndex].setPdfPage(oldIndexPage);
    this.refresh();
  }
  // #2943 end of modification by ngx-extended-pdf-viewer

  getCachedPageViews() {
    return new Set(this.#buffer);
  }

  /**
   * @type {boolean} - True if all {PDFPageView} objects are initialized.
   */
  get pageViewsReady() {
    // Prevent printing errors when 'disableAutoFetch' is set, by ensuring
    // that *all* pages have in fact been completely loaded.
    return this._pages.every(pageView => pageView?.pdfPage);
  }

  /**
   * @type {boolean}
   */
  get renderForms() {
    return this.#annotationMode === AnnotationMode.ENABLE_FORMS;
  }

  /**
   * @type {boolean}
   */
  get enableScripting() {
    return !!this._scriptingManager;
  }

  /**
   * @type {number}
   */
  get currentPageNumber() {
    return this._currentPageNumber;
  }

  /**
   * @param {number} val - The page number.
   */
  set currentPageNumber(val) {
    if (!Number.isInteger(val)) {
      throw new Error("Invalid page number.");
    }
    if (!this.pdfDocument) {
      return;
    }

    // #716 modified by ngx-extended-pdf-viewer
    const flip = Math.abs(this._currentPageNumber - val) <= 2;
    // #716 end of modification

    // The intent can be to just reset a scroll position and/or scale.
    if (!this._setCurrentPageNumber(val, /* resetCurrentPageView = */ true)) {
      NgxConsole.error(`currentPageNumber: "${val}" is not a valid page.`);
    }
    // #716 modified by ngx-extended-pdf-viewer
    if (this.pageFlip) {
      if (flip) {
        this.pageFlip.flip(val - 1);
      } else {
        this.pageFlip.turnToPage(val - 1);
      }
      this.ensureAdjacentPagesAreLoaded();
    }
    // #716 end of modification
  }

  /** #495 modified by ngx-extended-pdf-viewer */
  hidePagesDependingOnpageViewMode() {
    if (this.pageViewMode === "book") {
      if (!this.pageFlip) {
        setTimeout(() => {
          if (!this.pageFlip) {
            const page1 = this._pages[0].div;
            const htmlParentElement = page1.parentElement;
            const viewer = htmlParentElement.parentElement;
            viewer.style.width = 2 * page1.clientWidth + "px";
            viewer.style.overflow = "hidden";
            viewer.style.marginLeft = "auto";
            viewer.style.marginRight = "auto";
            this.pageFlip = new PageFlip(
              htmlParentElement,
              {
                width: page1.clientWidth,
                height: page1.clientHeight,
                showCover: true,
                size: "fixed",
              },
              this.cspPolicyService
            ); // #2362 modified by ngx-extended-pdf-viewer
            this.pageFlip.loadFromHTML(this.container.querySelectorAll(".page"));
            // triggered by page turning
            this.pageFlip.on("flip", e => {
              if (this._currentPageNumber !== e.data + 1) {
                this._setCurrentPageNumber(e.data + 1, false);
              }
            });
          }
        }, 100);
      }
      // #716 end of modification
    }
  }
  /** end of modification */

  /**
   * @returns {boolean} Whether the pageNumber is valid (within bounds).
   * @private
   */
  async _setCurrentPageNumber(val, resetCurrentPageView = false) {
    if (this._currentPageNumber === val) {
      if (resetCurrentPageView) {
        this.#resetCurrentPageView();
      }
      return true;
    }

    if (!(0 < val && val <= this.pagesCount)) {
      return false;
    }
    const previous = this._currentPageNumber;
    this._currentPageNumber = val;

    /** #495 modified by ngx-extended-pdf-viewer */
    this.hidePagesDependingOnpageViewMode();
    // #716 modified by ngx-extended-pdf-viewer
    if (this.pageViewMode === "book" || this.pageViewMode === "infinite-scroll") {
      const pageView = this._pages[this.currentPageNumber - 1];
      if (pageView.div.parentElement.classList.contains("spread")) {
        pageView.div.parentElement.childNodes.forEach(async div => {
          const pageNumber = Number(div.getAttribute("data-page-number"));
          const pv = this._pages[pageNumber - 1];
          await this.#ensurePdfPageLoaded(pv);
          this.renderingQueue.renderView(pv);
          div.style.display = "inline-block";
        });
      } else {
        await this.#ensurePdfPageLoaded(pageView);
        this.renderingQueue.renderView(pageView);

        // #716 modified by ngx-extended-pdf-viewer
        if (this.#pageViewMode === "book") {
          this.ensureAdjacentPagesAreLoaded();
        }
        // #716 modified by ngx-extended-pdf-viewer
      }
    }
    /** end of modification */

    this.eventBus.dispatch("pagechanging", {
      source: this,
      pageNumber: val,
      pageLabel: this._pageLabels?.[val - 1] ?? null,
      previous,
    });

    if (resetCurrentPageView) {
      this.#resetCurrentPageView();
    }
    return true;
  }

  // #950 modified by ngx-extended-pdf-viewer
  /**
   * Adds a page to the rendering queue
   * @param {number} pageIndex Index of the page to render
   * @returns {boolean} false, if the page has already been rendered
   * or if it's out of range
   */
  addPageToRenderQueue(pageIndex = 0) {
    if (pageIndex >= 0 && pageIndex <= this._pages.length - 1) {
      const pageView = this._pages[pageIndex];
      const isLoading = pageView.renderingState === RenderingStates.INITIAL;
      if (isLoading) {
        this.#ensurePdfPageLoaded(pageView).then(() => {
          // todo: this cancels any rendering that's already in progress
          this.renderingQueue.renderView(pageView);
        });
        return true;
      }
    }
    return false;
  }
  // #950 end of modification by ngx-extended-pdf-viewer

  // #716 modified by ngx-extended-pdf-viewer
  async ensureAdjacentPagesAreLoaded() {
    const advances = [0, 1, -1, 2, -2, -3];
    let offset = 0;
    if (this.currentPageNumber % 2 === 1) {
      offset = -1;
    }
    let renderAsynchronously = false;
    for (const advance of advances) {
      const pageIndex = this.currentPageNumber + advance + offset;
      if (pageIndex >= 0 && pageIndex < this._pages.length) {
        try {
          const pageView = this._pages[pageIndex];
          await this.#ensurePdfPageLoaded(pageView);

          const isAlreadyRendering = this._pages.some(
            pv => pv.renderingState === RenderingStates.RUNNING || pv.renderingState === RenderingStates.PAUSED
          );
          if (isAlreadyRendering || renderAsynchronously) {
            const loader = () => this.adjacentPagesRenderer(loader, pageIndex);
            this.eventBus._on("pagerendered", loader);
            this.eventBus._on("thumbnailRendered", loader);
          } else {
            renderAsynchronously = this.adjacentPagesRenderer(null, pageIndex);
          }
        } catch (exception) {
          NgxConsole.log("Exception during pre-rendering page %s", pageIndex, exception);
        }
      }
    }
  }

  adjacentPagesRenderer(self, pageIndex) {
    const isAlreadyRendering = this._pages.find(pageView => pageView.renderingState === RenderingStates.RUNNING);
    if (isAlreadyRendering) {
      // renderView() cancels any rendering in progress -
      // let's wait until the page has rendered
      return true;
    }
    const pausedRendering = this._pages.find(pageView => pageView.renderingState === RenderingStates.PAUSED);
    if (pausedRendering) {
      // another page or thumbnail has already been requested,
      // so let's wait until it has finished
      this.renderingQueue.renderView(pausedRendering);
      return true;
    }
    if (self) {
      this.eventBus._off("pagerendered", self);
      this.eventBus._off("thumbnailRendered", self);
    }

    if (pageIndex >= 0 && pageIndex < this._pages.length) {
      const pageView = this._pages[pageIndex];
      const needsToBeRendered = pageView.renderingState === RenderingStates.INITIAL;
      if (needsToBeRendered) {
        this.renderingQueue.renderView(pageView);
        return true;
      }
    }
    return false;
  }
  // #716 modified by ngx-extended-pdf-viewer

  /**
   * @type {string|null} Returns the current page label, or `null` if no page
   *   labels exist.
   */
  get currentPageLabel() {
    return this._pageLabels?.[this._currentPageNumber - 1] ?? null;
  }

  /**
   * @param {string} val - The page label.
   */
  set currentPageLabel(val) {
    if (!this.pdfDocument) {
      return;
    }
    let page = val | 0; // Fallback page number.
    if (this._pageLabels) {
      const i = this._pageLabels.indexOf(val);
      if (i >= 0) {
        page = i + 1;
      }
    }
    // The intent can be to just reset a scroll position and/or scale.
    if (!this._setCurrentPageNumber(page, /* resetCurrentPageView = */ true)) {
      NgxConsole.error(`currentPageLabel: "${val}" is not a valid page.`);
    }
  }

  /**
   * @type {number}
   */
  get currentScale() {
    return this._currentScale !== UNKNOWN_SCALE
      ? this._currentScale
      : DEFAULT_SCALE;
  }

  /**
   * @param {number} val - Scale of the pages in percents.
   */
  set currentScale(val) {
    if (isNaN(val)) {
      throw new Error("Invalid numeric scale.");
    }
    if (!this.pdfDocument) {
      return;
    }
    this.#setScale(val, { noScroll: false });
  }

  /**
   * @type {string}
   */
  get currentScaleValue() {
    return this._currentScaleValue;
  }

  /**
   * @param val - The scale of the pages (in percent or predefined value).
   */
  set currentScaleValue(val) {
    if (!this.pdfDocument) {
      return;
    }
    this.#setScale(val, { noScroll: false });
  }

  /**
   * @type {number}
   */
  get pagesRotation() {
    return this._pagesRotation;
  }

  /**
   * @param {number} rotation - The rotation of the pages (0, 90, 180, 270).
   */
  set pagesRotation(rotation) {
    if (!isValidRotation(rotation)) {
      throw new Error("Invalid pages rotation angle.");
    }
    if (!this.pdfDocument) {
      return;
    }
    // Normalize the rotation, by clamping it to the [0, 360) range.
    rotation %= 360;
    if (rotation < 0) {
      rotation += 360;
    }
    if (this._pagesRotation === rotation) {
      return; // The rotation didn't change.
    }
    this._pagesRotation = rotation;

    const pageNumber = this._currentPageNumber;

    this.refresh(true, { rotation });

    // Prevent errors in case the rotation changes *before* the scale has been
    // set to a non-default value.
    if (this._currentScaleValue) {
      this.#setScale(this._currentScaleValue, { noScroll: true });
    }

    this.eventBus.dispatch("rotationchanging", {
      source: this,
      pagesRotation: rotation,
      pageNumber,
    });

    if (this.defaultRenderingQueue) {
      this.update();
    }
  }

  get firstPagePromise() {
    return this.pdfDocument ? this._firstPageCapability.promise : null;
  }

  get onePageRendered() {
    return this.pdfDocument ? this._onePageRenderedCapability.promise : null;
  }

  get pagesPromise() {
    return this.pdfDocument ? this._pagesCapability.promise : null;
  }

  get _layerProperties() {
    const self = this;
    return shadow(this, "_layerProperties", {
      get annotationEditorUIManager() {
        return self.#annotationEditorUIManager;
      },
      get annotationStorage() {
        return self.pdfDocument?.annotationStorage;
      },
      get downloadManager() {
        return self.downloadManager;
      },
      get enableComment() {
        return !!self.#commentManager;
      },
      get enableScripting() {
        return !!self._scriptingManager;
      },
      get fieldObjectsPromise() {
        return self.pdfDocument?.getFieldObjects();
      },
      get findController() {
        return self.findController;
      },
      // #2488 modified by ngx-extended-pdf-viewer
      get customFindController() {
        return self.customFindController;
      },
      // #2488 end of modification by ngx-extended-pdf-viewer
      get hasJSActionsPromise() {
        return self.pdfDocument?.hasJSActions();
      },
      get linkService() {
        return self.linkService;
      },
    });
  }

  /**
   * Currently only *some* permissions are supported.
   * @returns {Object}
   */
  #initializePermissions(permissions) {
    const params = {
      annotationEditorMode: this.#annotationEditorMode,
      annotationMode: this.#annotationMode,
      textLayerMode: this.#textLayerMode,
    };
    if (!permissions) {
      this.#printingAllowed = true;
      this.eventBus.dispatch("printingallowed", {
        source: this,
        isAllowed: this.#printingAllowed,
      });

      return params;
    }

    this.#printingAllowed =
      permissions.includes(PermissionFlag.PRINT_HIGH_QUALITY) ||
      permissions.includes(PermissionFlag.PRINT);
    this.eventBus.dispatch("printingallowed", {
      source: this,
      isAllowed: this.#printingAllowed,
    });

    if (
      !permissions.includes(PermissionFlag.COPY) &&
      this.#textLayerMode === TextLayerMode.ENABLE
    ) {
      params.textLayerMode = TextLayerMode.ENABLE_PERMISSIONS;
    }

    if (!permissions.includes(PermissionFlag.MODIFY_CONTENTS)) {
      params.annotationEditorMode = AnnotationEditorType.DISABLE;
    }

    if (
      !permissions.includes(PermissionFlag.MODIFY_ANNOTATIONS) &&
      !permissions.includes(PermissionFlag.FILL_INTERACTIVE_FORMS) &&
      this.#annotationMode === AnnotationMode.ENABLE_FORMS
    ) {
      params.annotationMode = AnnotationMode.ENABLE;
    }

    return params;
  }

  async #onePageRenderedOrForceFetch(signal) {
    // Unless the viewer *and* its pages are visible, rendering won't start and
    // `this._onePageRenderedCapability` thus won't be resolved.
    // To ensure that automatic printing, on document load, still works even in
    // those cases we force-allow fetching of all pages when:
    //  - The current window/tab is inactive, which will prevent rendering since
    //    `requestAnimationFrame` is being used; fixes bug 1746213.
    //  - The viewer is hidden in the DOM, e.g. in a `display: none` <iframe>
    //    element; fixes bug 1618621.
    //  - The viewer is visible, but none of the pages are (e.g. if the
    //    viewer is very small); fixes bug 1618955.
    if (
      document.visibilityState === "hidden" ||
      !this.container.offsetParent ||
      this._getVisiblePages().views.length === 0
    ) {
      return;
    }

    // Handle the window/tab becoming inactive *after* rendering has started;
    // fixes (another part of) bug 1746213.
    const hiddenCapability = Promise.withResolvers(),
      ac = new AbortController();
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") {
          hiddenCapability.resolve();
        }
      },
      { signal: AbortSignal.any([signal, ac.signal]) }
    );

    await Promise.race([
      this._onePageRenderedCapability.promise,
      hiddenCapability.promise,
    ]);
    ac.abort(); // Remove the "visibilitychange" listener immediately.
  }

  async getAllText(interruptSignal = null) {
    const texts = [];
    const buffer = [];
    for (
      let pageNum = 1, pagesCount = this.pdfDocument.numPages;
      pageNum <= pagesCount;
      ++pageNum
    ) {
      if (interruptSignal?.aborted) {
        return null;
      }
      buffer.length = 0;
      const page = await this.pdfDocument.getPage(pageNum);
      // By default getTextContent pass disableNormalization equals to false
      // which is fine because we want a normalized string.
      const { items } = await page.getTextContent();
      for (const item of items) {
        if (item.str) {
          buffer.push(item.str);
        }
        if (item.hasEOL) {
          buffer.push("\n");
        }
      }
      texts.push(removeNullCharacters(buffer.join("")));
    }

    return texts.join("\n");
  }

  #copyCallback(textLayerMode, event) {
    const selection = document.getSelection();
    const { focusNode, anchorNode } = selection;
    if (
      anchorNode &&
      focusNode &&
      selection.containsNode(this.#hiddenCopyElement)
    ) {
      // About the condition above:
      //  - having non-null anchorNode and focusNode are here to guaranty that
      //    we have at least a kind of selection.
      //  - this.#hiddenCopyElement is an invisible element which is impossible
      //    to select manually (its display is none) but ctrl+A will select all
      //    including this element so having it in the selection means that all
      //    has been selected.

      if (
        this.#copyAllInProgress ||
        textLayerMode === TextLayerMode.ENABLE_PERMISSIONS
      ) {
        stopEvent(event);
        return;
      }
      this.#copyAllInProgress = true;

      // TODO: if all the pages are rendered we don't need to wait for
      // getAllText and we could just get text from the Selection object.

      // Select all the document.
      const { classList } = this.viewer;
      classList.add("copyAll");

      const keydownAC = new AbortController(),
        interruptAC = new AbortController();
      window.addEventListener(
        "keydown",
        ev => {
          if (ev.key === "Escape") {
            interruptAC.abort();
          }
        },
        { signal: keydownAC.signal }
      );

      this.getAllText(interruptAC.signal)
        .then(async text => {
          if (text !== null) {
            await navigator.clipboard.writeText(text);
          }
        })
        .catch(reason => {
          NgxConsole.warn(
            `Something goes wrong when extracting the text: ${reason.message}`
          );
        })
        .finally(() => {
          this.#copyAllInProgress = false;
          keydownAC.abort();
          classList.remove("copyAll");
        });

      stopEvent(event);
    }
  }

  /**
   * @param {PDFDocumentProxy} pdfDocument
   */
  setDocument(pdfDocument) {
    if (this.pdfDocument) {
      this.eventBus.dispatch("pagesdestroy", { source: this });

      this._cancelRendering();
      this._resetView();

      this.findController?.setDocument(null);
      this.customFindController?.setDocument(null); // #2488 modified by ngx-extended-pdf-viewer
      this._scriptingManager?.setDocument(null);

      this.#annotationEditorUIManager?.destroy();
      this.#annotationEditorUIManager = null;

      this.#annotationEditorMode = AnnotationEditorType.NONE;

      this.#printingAllowed = true;
    }

    this.pdfDocument = pdfDocument;
    if (!pdfDocument) {
      return;
    }
    const pagesCount = pdfDocument.numPages;
    const firstPagePromise = pdfDocument.getPage(1);
    // Rendering (potentially) depends on this, hence fetching it immediately.
    const optionalContentConfigPromise = pdfDocument.getOptionalContentConfig({
      intent: "display",
    });
    const permissionsPromise = this.#enablePermissions
      ? pdfDocument.getPermissions()
      : Promise.resolve();

    const { eventBus, pageColors, viewer } = this;

    this.#eventAbortController = new AbortController();
    const { signal } = this.#eventAbortController;

    // Given that browsers don't handle huge amounts of DOM-elements very well,
    // enforce usage of PAGE-scrolling when loading *very* long/large documents.
    if (pagesCount > PagesCountLimit.FORCE_SCROLL_MODE_PAGE) {
      NgxConsole.warn(
        "Forcing PAGE-scrolling for performance reasons, given the length of the document."
      );
      const mode = (this._scrollMode = ScrollMode.PAGE);
      eventBus.dispatch("scrollmodechanged", { source: this, mode });
    }

    this._pagesCapability.promise.then(
      () => {
        eventBus.dispatch("pagesloaded", { source: this, pagesCount });
      },
      () => {
        /* Prevent "Uncaught (in promise)"-messages in the console. */
      }
    );

    const onBeforeDraw = evt => {
      const pageView = this._pages[evt.pageNumber - 1];
      if (!pageView) {
        return;
      }
      // Add the page to the buffer at the start of drawing. That way it can be
      // evicted from the buffer and destroyed even if we pause its rendering.
      this.#buffer.push(pageView);
    };
    eventBus._on("pagerender", onBeforeDraw, { signal });

    const onAfterDraw = evt => {
      if (evt.cssTransform || evt.isDetailView) {
        return;
      }
      this._onePageRenderedCapability.resolve({ timestamp: evt.timestamp });

      eventBus._off("pagerendered", onAfterDraw); // Remove immediately.
    };
    eventBus._on("pagerendered", onAfterDraw, { signal });

    // Fetch a single page so we can get a viewport that will be the default
    // viewport for all pages
    Promise.all([firstPagePromise, permissionsPromise])
      .then(([firstPdfPage, permissions]) => {
        if (pdfDocument !== this.pdfDocument) {
          return; // The document was closed while the first page resolved.
        }
        this._firstPageCapability.resolve(firstPdfPage);
        this._optionalContentConfigPromise = optionalContentConfigPromise;

        const { annotationEditorMode, annotationMode, textLayerMode } =
          this.#initializePermissions(permissions);

        if (textLayerMode !== TextLayerMode.DISABLE) {
          const element = (this.#hiddenCopyElement =
            document.createElement("div"));
          element.id = "hiddenCopyElement";
          viewer.before(element);
        }

        if (annotationEditorMode !== AnnotationEditorType.DISABLE) {
          const mode = annotationEditorMode;

          if (pdfDocument.isPureXfa) {
            NgxConsole.warn("Warning: XFA-editing is not implemented.");
          } else if (isValidAnnotationEditorMode(mode)) {
            this.#annotationEditorUIManager = new AnnotationEditorUIManager(
              this.container,
              viewer,
              this.#viewerAlert,
              this.#altTextManager,
              this.#commentManager,
              this.#signatureManager,
              eventBus,
              pdfDocument,
              pageColors,
              this.#annotationEditorHighlightColors,
              this.#enableHighlightFloatingButton,
              this.#enableUpdatedAddImage,
              this.#enableNewAltTextWhenAddingImage,
              this.#mlManager,
              this.#editorUndoBar,
              this.#supportsPinchToZoom
            );
            eventBus.dispatch("annotationeditoruimanager", {
              source: this,
              uiManager: this.#annotationEditorUIManager,
            });
            if (mode !== AnnotationEditorType.NONE) {
              this.#preloadEditingData(mode);
              this.#annotationEditorUIManager.updateMode(mode);
            }
          } else {
            NgxConsole.error(`Invalid AnnotationEditor mode: ${mode}`);
          }
        }

        const viewerElement =
          this._scrollMode === ScrollMode.PAGE ? null : viewer;
        const scale = this.currentScale;
        const viewport = firstPdfPage.getViewport({
          scale: scale * PixelsPerInch.PDF_TO_CSS_UNITS,
        });
        // Ensure that the various layers always get the correct initial size,
        // see issue 15795.
        viewer.style.setProperty("--scale-factor", viewport.scale);

        if (pageColors?.background) {
          viewer.style.setProperty("--page-bg-color", pageColors.background);
        }
        if (
          pageColors?.foreground === "CanvasText" ||
          pageColors?.background === "Canvas"
        ) {
          viewer.style.setProperty(
            "--hcm-highlight-filter",
            pdfDocument.filterFactory.addHighlightHCMFilter(
              "highlight",
              "CanvasText",
              "Canvas",
              "HighlightText",
              "Highlight"
            )
          );
          viewer.style.setProperty(
            "--hcm-highlight-selected-filter",
            pdfDocument.filterFactory.addHighlightHCMFilter(
              "highlight_selected",
              "CanvasText",
              "Canvas",
              "HighlightText",
              "ButtonText"
            )
          );
        }

        for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
          const pageView = new PDFPageView({
            container: viewerElement,
            eventBus,
            id: pageNum,
            scale,
            defaultViewport: viewport.clone(),
            optionalContentConfigPromise,
            renderingQueue: this.renderingQueue,
            textLayerMode,
            annotationMode,
            imageResourcesPath: this.imageResourcesPath,
            maxCanvasPixels: this.maxCanvasPixels,
            maxCanvasDim: this.maxCanvasDim,
            capCanvasAreaFactor: this.capCanvasAreaFactor,
            enableDetailCanvas: this.enableDetailCanvas,
            enableOptimizedPartialRendering:
              this.enableOptimizedPartialRendering,
            imagesRightClickMinSize: this.imagesRightClickMinSize,
            pageColors,
            l10n: this.l10n,
            layerProperties: this._layerProperties,
            enableAutoLinking: this.#enableAutoLinking,
            minDurationToUpdateCanvas: this.#minDurationToUpdateCanvas,
            commentManager: this.#commentManager,
            abortSignal: this.#abortSignal,
          });
          this._pages.push(pageView);
        }
        // Set the first `pdfPage` immediately, since it's already loaded,
        // rather than having to repeat the `PDFDocumentProxy.getPage` call in
        // the `this.#ensurePdfPageLoaded` method before rendering can start.
        this._pages[0]?.setPdfPage(firstPdfPage);

        if (this._scrollMode === ScrollMode.PAGE) {
          // Ensure that the current page becomes visible on document load.
          this.#ensurePageViewVisible();
        } else if (this._spreadMode !== SpreadMode.NONE) {
          this._updateSpreadMode();
        }

        eventBus._on(
          "annotationeditorlayerrendered",
          evt => {
            if (this.#annotationEditorUIManager) {
              // Ensure that the Editor buttons, in the toolbar, are updated.
              eventBus.dispatch("annotationeditormodechanged", {
                source: this,
                mode: this.#annotationEditorMode,
              });
            }
          },
          { once: true, signal }
        );

        // Fetch all the pages since the viewport is needed before printing
        // starts to create the correct size canvas. Wait until one page is
        // rendered so we don't tie up too many resources early on.
        this.#onePageRenderedOrForceFetch(signal).then(async () => {
          if (pdfDocument !== this.pdfDocument) {
            return; // The document was closed while the first page rendered.
          }
          this.findController?.setDocument(pdfDocument); // Enable searching.
          // #2488 modified by ngx-extended-pdf-viewer
          this.customFindController?.setDocument(pdfDocument); // Enable programmatic searching.
          // #2488 end of modification by ngx-extended-pdf-viewer
          this._scriptingManager?.setDocument(pdfDocument); // Enable scripting.

          if (this.#hiddenCopyElement) {
            document.addEventListener(
              "copy",
              this.#copyCallback.bind(this, textLayerMode),
              { signal }
            );
          }

          // In addition to 'disableAutoFetch' being set, also attempt to reduce
          // resource usage when loading *very* long/large documents.
          if (
            pdfDocument.loadingParams.disableAutoFetch ||
            pagesCount > PagesCountLimit.FORCE_LAZY_PAGE_INIT
          ) {
            // XXX: Printing is semi-broken with auto fetch disabled.
            this._pagesCapability.resolve();
            return;
          }
          let getPagesLeft = pagesCount - 1; // The first page was already loaded.

          if (getPagesLeft <= 0) {
            this._pagesCapability.resolve();
            return;
          }

  		  // #716 modified by ngx-extended-pdf-viewer
          if (this.#pageViewMode === "book") {
            await this.ensureAdjacentPagesAreLoaded();
          }
          // #716 end of modification by ngx-extended-pdf-viewer

          for (let pageNum = 2; pageNum <= pagesCount; ++pageNum) {
            const promise = pdfDocument.getPage(pageNum).then(
              pdfPage => {
                const pageView = this._pages[pageNum - 1];
                if (!pageView.pdfPage) {
                  pageView.setPdfPage(pdfPage);
                }
                if (--getPagesLeft === 0) {
                  this._pagesCapability.resolve();
                }
              },
              reason => {
                NgxConsole.error(
                  `Unable to get page ${pageNum} to initialize viewer`,
                  reason
                );
                if (--getPagesLeft === 0) {
                  this._pagesCapability.resolve();
                }
              }
            );

            if (pageNum % PagesCountLimit.PAUSE_EAGER_PAGE_INIT === 0) {
              await promise;
            }
          }
        });

        /** #495 modified by ngx-extended-pdf-viewer */
        this.hidePagesDependingOnpageViewMode();
        /** end of modification */

        eventBus.dispatch("pagesinit", { source: this });

        pdfDocument.getMetadata().then(({ info }) => {
          if (pdfDocument !== this.pdfDocument) {
            return; // The document was closed while the metadata resolved.
          }
          if (info.Language) {
            viewer.lang = info.Language;
          }
        });

        if (this.defaultRenderingQueue) {
          this.update();
        }
      })
      .catch(reason => {
        NgxConsole.error("Unable to initialize viewer", reason);

        this._pagesCapability.reject(reason);
      });
  }

  onPagesEdited({ pagesMapper, type, hasBeenCut, pageNumbers }) {
    if (type === "copy") {
      this.#copiedPageViews = new Map();
      for (const pageNum of pageNumbers) {
        this.#copiedPageViews.set(pageNum, this._pages[pageNum - 1]);
      }
      return;
    }

    if (type === "cancelCopy") {
      this.#copiedPageViews = null;
      return;
    }

    const isCut = type === "cut";
    if (isCut || type === "delete") {
      this.#savedPageViews = this._pages;
      this.#deletedPageNumbers = pageNumbers;
    }

    if (type === "cancelDelete") {
      this.#deletedPageNumbers = null;
      if (!this.#savedPageViews) {
        return;
      }
      const viewerElement =
        this._scrollMode === ScrollMode.PAGE ? null : this.viewer;
      if (viewerElement) {
        this.#annotationEditorUIManager?.startUpdatePages();
        const fragment = document.createDocumentFragment();
        for (let i = 0, ii = this.#savedPageViews.length; i < ii; i++) {
          const page = this.#savedPageViews[i];
          page.updatePageNumber(i + 1);
          fragment.append(page.div);
        }
        viewerElement.replaceChildren(fragment);
        this.#annotationEditorUIManager?.endUpdatePages();
      }
      this._pages = this.#savedPageViews;
      this.#savedPageViews = null;
      return;
    }

    if (type === "cleanSavedData") {
      if (this.#deletedPageNumbers) {
        if (this.#savedPageViews) {
          for (const pageNum of this.#deletedPageNumbers) {
            this.#savedPageViews[pageNum - 1].deleteMe();
          }
          this.#savedPageViews = null;
        }
        this.#deletedPageNumbers = null;
      }
      return;
    }

    this._currentPageNumber = 0;
    const prevPages = this._pages;
    const newPages = (this._pages = []);

    this.#annotationEditorUIManager?.startUpdatePages();

    for (let i = 1, ii = pagesMapper.pagesNumber; i <= ii; i++) {
      const prevPageNumber = pagesMapper.getPrevPageNumber(i);
      if (prevPageNumber < 0) {
        let page = this.#copiedPageViews.get(-prevPageNumber);
        if (hasBeenCut) {
          page.updatePageNumber(i);
        } else {
          this.#annotationEditorUIManager?.clonePage(
            -prevPageNumber - 1,
            i - 1
          );
          page = page.clone(i);
        }
        newPages.push(page);
        continue;
      }
      const page = prevPages[prevPageNumber - 1];
      newPages.push(page);
      page.updatePageNumber(i);
    }

    this.#annotationEditorUIManager?.endUpdatePages();

    if (type === "paste") {
      this.#copiedPageViews = null;
    }

    const viewerElement =
      this._scrollMode === ScrollMode.PAGE ? null : this.viewer;
    if (viewerElement) {
      const fragment = document.createDocumentFragment();
      for (const { div } of newPages) {
        fragment.append(div);
      }
      viewerElement.replaceChildren(fragment);
    }

    setTimeout(() => {
      this.forceRendering();
    });
  }

  /**
   * @param {Array|null} labels
   */
  setPageLabels(labels) {
    if (!this.pdfDocument) {
      return;
    }
    if (!labels) {
      this._pageLabels = null;
    } else if (
      !(Array.isArray(labels) && this.pdfDocument.numPages === labels.length)
    ) {
      this._pageLabels = null;
      NgxConsole.error(`setPageLabels: Invalid page labels.`);
    } else {
      this._pageLabels = labels;
    }
    // Update all the `PDFPageView` instances.
    for (let i = 0, ii = this._pages.length; i < ii; i++) {
      this._pages[i].setPageLabel(this._pageLabels?.[i] ?? null);
    }
  }

  _resetView() {
    this._pages = [];
    this._currentPageNumber = 1;
    this._currentScale = UNKNOWN_SCALE;
    this._currentScaleValue = null;
    this._pageLabels = null;
    // #950 modified by ngx-extended-pdf-viewer
    const bufferSize = this.defaultCacheSize || DEFAULT_CACHE_SIZE;
    this.#buffer = new PDFPageViewBuffer(bufferSize);
    // #950 end of modification by ngx-extended-pdf-viewer
    this._location = null;
    this._pagesRotation = 0;
    this._optionalContentConfigPromise = null;
    this._firstPageCapability = Promise.withResolvers();
    this._onePageRenderedCapability = Promise.withResolvers();
    this._pagesCapability = Promise.withResolvers();
    this._scrollMode = ScrollMode.VERTICAL;
    this._previousScrollMode = ScrollMode.UNKNOWN;
    this._spreadMode = SpreadMode.NONE;

    this.#scrollModePageState = {
      previousPageNumber: 1,
      scrollDown: true,
      pages: [],
    };

    this.#eventAbortController?.abort();
    this.#eventAbortController = null;

    // Remove the pages from the DOM...
    this.viewer.textContent = "";
    // ... and reset the Scroll mode CSS class(es) afterwards.
    this._updateScrollMode();

    this.viewer.removeAttribute("lang");

    this.#hiddenCopyElement?.remove();
    this.#hiddenCopyElement = null;

    this.#cleanupTimeouts();
    this.#cleanupSwitchAnnotationEditorMode();
  }

  #ensurePageViewVisible() {
    if (this._scrollMode !== ScrollMode.PAGE) {
      throw new Error("#ensurePageViewVisible: Invalid scrollMode value.");
    }
    const pageNumber = this._currentPageNumber,
      state = this.#scrollModePageState,
      viewer = this.viewer;

    // Temporarily remove all the pages from the DOM...
    viewer.textContent = "";
    // ... and clear out the active ones.
    state.pages.length = 0;

    if (this._spreadMode === SpreadMode.NONE && !this.isInPresentationMode) {
      // Finally, append the new page to the viewer.
      const pageView = this._pages[pageNumber - 1];
      viewer.append(pageView.div);

      state.pages.push(pageView);
    } else {
      const pageIndexSet = new Set(),
        parity = this._spreadMode - 1;

      // Determine the pageIndices in the new spread.
      if (parity === -1) {
        // PresentationMode is active, with `SpreadMode.NONE` set.
        pageIndexSet.add(pageNumber - 1);
      } else if (pageNumber % 2 !== parity) {
        // Left-hand side page.
        pageIndexSet.add(pageNumber - 1);
        pageIndexSet.add(pageNumber);
      } else {
        // Right-hand side page.
        pageIndexSet.add(pageNumber - 2);
        pageIndexSet.add(pageNumber - 1);
      }

      // Finally, append the new pages to the viewer and apply the spreadMode.
      const spread = document.createElement("div");
      spread.className = "spread";

      if (this.isInPresentationMode) {
        const dummyPage = document.createElement("div");
        dummyPage.className = "dummyPage";
        spread.append(dummyPage);
      }

      for (const i of pageIndexSet) {
        const pageView = this._pages[i];
        if (!pageView) {
          continue;
        }
        spread.append(pageView.div);

        state.pages.push(pageView);
      }
      viewer.append(spread);
    }

    state.scrollDown = pageNumber >= state.previousPageNumber;
    state.previousPageNumber = pageNumber;
  }

  _scrollUpdate() {
    if (this.pagesCount === 0) {
      return;
    }

    if (this.#scrollTimeoutId) {
      clearTimeout(this.#scrollTimeoutId);
    }
    this.#scrollTimeoutId = setTimeout(() => {
      this.#scrollTimeoutId = null;
      this.update();
    }, 100);

    // #3069 modified by ngx-extended-pdf-viewer
    // In infinite-scroll mode, the immediate update() call happens before
    // the scroll has visually taken effect. This causes _getVisiblePages
    // to return stale results, resetting the page number back to page 1
    // after a programmatic navigation (e.g., entering a page number).
    // Use noScroll=true for the immediate call to prevent the page number
    // reset; the debounced call at 100ms will update it correctly.
    if (this.pageViewMode === "infinite-scroll") {
      this.update(true);
    } else {
      this.update();
    }
    // #3069 end of modification by ngx-extended-pdf-viewer
  }

  // #1301 modified by ngx-extended-pdf-viewer:
  // add an API to allow to scroll within a page
  scrollPagePosIntoView(pageNumber, pageSpot) {
    const pageDiv = this._pages[pageNumber - 1].div;

    if (pageSpot) {
      const targetPageSpot = { ...pageSpot };
      if (typeof targetPageSpot.top === "string") {
        if (targetPageSpot.top.endsWith("%")) {
          const percent = Number(targetPageSpot.top.replace("%", ""));
          const viewerHeight = this.viewer.querySelector(".page")?.clientHeight;
          let height = pageDiv.clientHeight ?? viewerHeight;
          const visibleWindowHeight = this.viewer.parentElement.clientHeight;
          height = Math.max(0, height - visibleWindowHeight);
          targetPageSpot.top = (percent * height) / 100;
        }
      }
      if (typeof targetPageSpot.left === "string") {
        if (targetPageSpot.left.endsWith("%")) {
          const percent = Number(targetPageSpot.left.replace("%", ""));
          const viewerWidth = this.viewer.querySelector(".page")?.clientWidth;
          const width = pageDiv.clientWidth ?? viewerWidth;
          targetPageSpot.left = (percent * width) / 100;
        }
      }
      this.#scrollIntoView({ div: pageDiv, id: pageNumber }, targetPageSpot);
    } else {
      this.#scrollIntoView({ div: pageDiv, id: pageNumber });
    }
  }
  // #1301 end of modification by ngx-extended-pdf-viewer

  #scrollIntoView(pageView, pageSpot = null) {
    // modified by ngx-extended-pdf-viewer
    // to fix a bug that's basically caused by the showcase demo
    if (!pageView) {
      return;
    }
    // #3069 modified by ngx-extended-pdf-viewer
    // Mark that a programmatic navigation is in progress so that
    // update() doesn't reset the page number while the scroll settles.
    if (this.pageViewMode === "infinite-scroll") {
      this.#lastNavigationTime = Date.now();
    }
    // #3069 end of modification by ngx-extended-pdf-viewer
    // end of modification by ngx-extended-pdf-viewer
    const { div, id } = pageView;

    // Ensure that `this._currentPageNumber` is correct, when `#scrollIntoView`
    // is called directly (and not from `#resetCurrentPageView`).
    if (this._currentPageNumber !== id) {
      this._setCurrentPageNumber(id);
    }
    if (this._scrollMode === ScrollMode.PAGE) {
      this.#ensurePageViewVisible();
      // Ensure that rendering always occurs, to avoid showing a blank page,
      // even if the current position doesn't change when the page is scrolled.
      this.update();
    }

    if (!pageSpot && !this.isInPresentationMode) {
      const left = div.offsetLeft + div.clientLeft,
        right = left + div.clientWidth;
      const { scrollLeft, clientWidth } = this.container;
      if (
        this._scrollMode === ScrollMode.HORIZONTAL ||
        left < scrollLeft ||
        right > scrollLeft + clientWidth
      ) {
        pageSpot = { left: 0, top: 0 };
      }
    }
    // #3155 modified by ngx-extended-pdf-viewer
    if (this._isContainerRtl && (this._scrollMode === ScrollMode.HORIZONTAL || this._scrollMode === ScrollMode.WRAPPED)) {
      // Position the target page at the right edge of the viewport,
      // which is the reading start position in RTL.
      div.scrollIntoView({ block: "nearest", inline: "end" });
    } else {
      scrollIntoView(div, pageSpot, false, this.pageViewMode === "infinite-scroll");
    }
    // #3155 end of modification by ngx-extended-pdf-viewer

    // Ensure that the correct *initial* document position is set, when any
    // OpenParameters are used, for documents with non-default Scroll/Spread
    // modes (fixes issue 15695). This is necessary since the scroll-handler
    // invokes the `update`-method asynchronously, and `this._location` could
    // thus be wrong when the initial zooming occurs in the default viewer.
    if (!this._currentScaleValue && this._location) {
      this._location = null;
    }
  }

  /**
   * Prevent unnecessary re-rendering of all pages when the scale changes
   * only because of limited numerical precision.
   */
  #isSameScale(newScale) {
    return (
      newScale === this._currentScale ||
      Math.abs(newScale - this._currentScale) < 1e-15
    );
  }

  #setScaleUpdatePages(
    newScale,
    newValue,
    { noScroll = false, preset = false, drawingDelay = -1, origin = null }
  ) {
    const previousScale = isNaN(Number(this.currentScale)) ? undefined : Number(this.currentScale);
    const previousScaleValue = this.currentScaleValue;
    this._currentScaleValue = newValue.toString();

    if (this.#isSameScale(newScale)) {
      if (preset) {
        this.eventBus.dispatch("scalechanging", {
          source: this,
          scale: newScale,
          presetValue: newValue,
          previousScale,
          previousPresetValue: previousScaleValue,
          noScroll,
        });
      }
      return;
    }

    const postponeDrawing = drawingDelay >= 0 && drawingDelay < 1000;

    this.viewer.style.setProperty(
      "--scale-factor",
      newScale * PixelsPerInch.PDF_TO_CSS_UNITS
    );

    this.refresh(true, {
      scale: newScale,
      drawingDelay: postponeDrawing ? drawingDelay : -1,
    });

    if (postponeDrawing) {
      // #3069 modified by ngx-extended-pdf-viewer
      // Freeze _location on the first frame of a zoom gesture. Scroll events
      // during the gesture overwrite _location with drifted values; using a
      // frozen copy prevents cumulative scroll drift.
      if (!this.#frozenLocation && this._location) {
        this.#frozenLocation = { ...this._location };
        this.#frozenScale = previousScale;
      }
      // #3069 end of modification by ngx-extended-pdf-viewer
      // #3069 modified by ngx-extended-pdf-viewer
      // Reset the timeout on each pinch step. Without this, the timeout
      // fires mid-gesture if pinching pauses for >400ms, triggering a
      // full re-render that causes a gray flash.
      if (this.#scaleTimeoutId !== null) {
        clearTimeout(this.#scaleTimeoutId);
      }
      // #3069 end of modification by ngx-extended-pdf-viewer
      this.#scaleTimeoutId = setTimeout(() => {
        this.#scaleTimeoutId = null;
        // #3069 modified by ngx-extended-pdf-viewer
        this.#frozenLocation = null;
        this.#frozenScale = null;
        // Snap scale to whole percent after gesture ends.
        // During the gesture we use 0.1% precision for smoothness.
        // Use #setScale so the scalechanging event fires and the
        // toolbar dropdown updates to a clean percentage.
        const snapped = Math.round(this._currentScale * 100) / 100;
        if (snapped !== this._currentScale) {
          this.#setScale(snapped, { noScroll: true, drawingDelay: -1 });
          return;
        }
        // #3069 end of modification by ngx-extended-pdf-viewer
        this.refresh();
      }, drawingDelay);
    }

    this._currentScale = newScale;

    if (!noScroll) {
      // #3069 modified by ngx-extended-pdf-viewer
      if (this.pageViewMode === "infinite-scroll") {
        // In infinite-scroll mode, the viewer container is tall enough to show
        // all pages (no internal scrollbar). The actual scrolling happens on an
        // outer container or the window. We must adjust THAT scroll position,
        // not this.container's (which is always 0).
        // Lazily find the outer scroll container if not yet cached.
        if (!this.#outerScrollContainer) {
          this.#outerScrollContainer =
            this.#findAncestorWithScrollbar(this.container);
        }
        const scrollEl = this.#outerScrollContainer;
        const ratio = newScale / previousScale;
        if (scrollEl) {
          // Only the PDF content scales — the header/tabs above the PDF
          // viewer in the scroll container do NOT scale. Use the PDF
          // container's bounding rect (not the scroll container's) to
          // compute the mouse offset within the scaling content.
          const containerRect = this.container.getBoundingClientRect();
          if (Array.isArray(origin)) {
            // origin is [clientX, clientY] in viewport coords.
            // Distance from mouse to PDF container top = the offset
            // within the scaling content. Only this part scales.
            scrollEl.scrollTop += (ratio - 1) * (origin[1] - containerRect.top);
            scrollEl.scrollLeft += (ratio - 1) * (origin[0] - containerRect.left);
          } else {
            // No origin — scale around the top of the visible PDF area.
            const scrollRect = scrollEl.getBoundingClientRect();
            scrollEl.scrollTop += (ratio - 1) * (scrollRect.top - containerRect.top);
            scrollEl.scrollLeft += (ratio - 1) * (scrollRect.left - containerRect.left);
          }
        } else {
          // Fallback: the window is the scrolling element.
          // Same principle: only the PDF content scales.
          const containerRect = this.container.getBoundingClientRect();
          if (Array.isArray(origin)) {
            const scaleDiff = ratio - 1;
            window.scrollBy(
              scaleDiff * (origin[0] - containerRect.left),
              scaleDiff * (origin[1] - containerRect.top)
            );
          } else {
            const scaleDiff = ratio - 1;
            window.scrollBy(
              scaleDiff * (0 - containerRect.left),
              scaleDiff * (0 - containerRect.top)
            );
          }
        }
      } else {
        // #3069 end of modification by ngx-extended-pdf-viewer
        // #3069 modified by ngx-extended-pdf-viewer
        // Reverted to native pdf.js approach: scrollPageIntoView() + origin
        // adjustment using containerTopLeft (offsetTop/offsetLeft).
        // The origin now uses screenX/Y (reverted in touch_manager.js).
        // Both are stable values that don't change with scroll or layout,
        // unlike getBoundingClientRect() which caused cumulative drift.
        {
          const c = this.container;

          // #3069 modified by ngx-extended-pdf-viewer
          // Use frozen location during gesture to prevent _location drift.
          const loc = this.#frozenLocation || this._location;
          let page = this._currentPageNumber,
            dest;
          if (
            loc &&
            !(this.isInPresentationMode || this.isChangingPresentationMode)
          ) {
            page = loc.pageNumber;
            dest = [
              null,
              { name: "XYZ" },
              loc.left,
              loc.top,
              null,
            ];
          }
          this.scrollPageIntoView({
            pageNumber: page,
            destArray: dest,
            allowNegativeOffset: true,
          });
          // #3069 end of modification by ngx-extended-pdf-viewer

          // #3069 modified by ngx-extended-pdf-viewer
          // Two fixes vs native pdf.js:
          // 1. Use getBoundingClientRect() instead of containerTopLeft
          //    (offsetTop/offsetLeft). In ngx-extended-pdf-viewer the viewer is
          //    embedded in Angular layout, so offsetTop/Left are relative to the
          //    offset parent, not the viewport. The origin from wheel events uses
          //    clientX/Y (viewport-relative), so we need viewport-relative coords.
          // 2. Use cumulative scale change from gesture start, not incremental.
          //    scrollPageIntoView() above resets scroll to the frozen baseline
          //    every frame, so we must apply the FULL adjustment from the initial
          //    scale, not just the last step's delta.
          if (Array.isArray(origin)) {
            const baseScale = this.#frozenScale || previousScale;
            const scaleDiff = newScale / baseScale - 1;
            const rect = c.getBoundingClientRect();
            c.scrollLeft += (origin[0] - rect.left) * scaleDiff;
            c.scrollTop += (origin[1] - rect.top) * scaleDiff;
          }
          // #3069 end of modification by ngx-extended-pdf-viewer
        }
        // #3069 end of modification by ngx-extended-pdf-viewer
      }

    }

    this.eventBus.dispatch("scalechanging", {
      source: this,
      scale: newScale,
      presetValue: preset ? newValue : undefined,
      previousScale,
      previousPresetValue: previousScaleValue,
      noScroll,
    });

    if (this.defaultRenderingQueue) {
      this.update();
    }
  }

  get #pageWidthScaleFactor() {
    if (
      this._spreadMode !== SpreadMode.NONE &&
      this._scrollMode !== ScrollMode.HORIZONTAL
    ) {
      return 2;
    }
    return 1;
  }

  #setScale(value, options) {
    // #90 modified by ngx-extended-pdf-viewer
    if (!value) {
      value = "auto";
    }
    // #90 end of modification by ngx-extended-pdf-viewer
    // #2458 modified by ngx-extended-pdf-viewer
    if (this.maxZoom && this.maxZoom === this.minZoom) {
      value = this.maxZoom;
    }
    // #2458 end of modification by ngx-extended-pdf-viewer
    let scale = parseFloat(value);
    // #1095 modified by ngx-extended-pdf-viewer: prevent duplicate rendering
    if (this._currentScale === scale) {
      return; // nothing to do
    }
    // #1095 end of modification

    if (scale > 0) {
      options.preset = false;
      this.#setScaleUpdatePages(scale, value, options);
    } else {
      const currentPage = this._pages[this._currentPageNumber - 1];
      if (!currentPage) {
        return;
      }
      let hPadding = SCROLLBAR_PADDING,
        vPadding = VERTICAL_PADDING;

      if (this.isInPresentationMode) {
        // Pages have a 2px (transparent) border in PresentationMode, see
        // the `web/pdf_viewer.css` file.
        hPadding = vPadding = 4; // 2 * 2px
        if (this._spreadMode !== SpreadMode.NONE) {
          // Account for two pages being visible in PresentationMode, thus
          // "doubling" the total border width.
          hPadding *= 2;
        }
      } else if (
        (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
        this.removePageBorders
      ) {
        hPadding = vPadding = 0;
      } else if (this._scrollMode === ScrollMode.HORIZONTAL) {
        [hPadding, vPadding] = [vPadding, hPadding]; // Swap the padding values.
      }
      let pageWidthScale =
        (((this.container.clientWidth - hPadding) / currentPage.width) *
          currentPage.scale) /
        this.#pageWidthScaleFactor;
      if (this.pageViewMode === "book") {
        pageWidthScale /= 2;
      }
      const pageHeightScale =
        ((this.container.clientHeight - vPadding) / currentPage.height) *
        currentPage.scale;
      switch (value) {
        case "page-actual":
          scale = 1;
          break;
        case "page-width":
          scale = pageWidthScale;
          break;
        case "page-height":
          scale = pageHeightScale;
          break;
        case "page-fit":
          scale = Math.min(pageWidthScale, pageHeightScale);
          break;
        case "auto":
          // For pages in landscape mode, fit the page height to the viewer
          // *unless* the page would thus become too wide to fit horizontally.
          const horizontalScale = isPortraitOrientation(currentPage)
            ? pageWidthScale
            : Math.min(pageHeightScale, pageWidthScale);
          scale = Math.min(MAX_AUTO_SCALE, horizontalScale);
          break;
        default:
          NgxConsole.error(`#setScale: "${value}" is an unknown zoom value.`);
          return;
      }
      options.preset = true;
      this.#setScaleUpdatePages(scale, value, options);
    }
  }

  /**
   * Refreshes page view: scrolls to the current page and updates the scale.
   */
  #resetCurrentPageView() {
    const pageView = this._pages[this._currentPageNumber - 1];

    if (this.isInPresentationMode) {
      // Fixes the case when PDF has different page sizes.
      this.#setScale(this._currentScaleValue, { noScroll: true });
    }
    this.#scrollIntoView(pageView);
  }

  /**
   * @param {string} label - The page label.
   * @returns {number|null} The page number corresponding to the page label,
   *   or `null` when no page labels exist and/or the input is invalid.
   */
  pageLabelToPageNumber(label) {
    if (!this._pageLabels) {
      return null;
    }
    const i = this._pageLabels.indexOf(label);
    if (i < 0) {
      return null;
    }
    return i + 1;
  }

  /**
   * @typedef {Object} ScrollPageIntoViewParameters
   * @property {number} pageNumber - The page number.
   * @property {Array} [destArray] - The original PDF destination array, in the
   *   format: <page-ref> </XYZ|/FitXXX> <args..>
   * @property {boolean} [allowNegativeOffset] - Allow negative page offsets.
   *   The default value is `false`.
   * @property {boolean} [ignoreDestinationZoom] - Ignore the zoom argument in
   *   the destination array. The default value is `false`.
   * @property {string} [center] - Center the view on the specified coordinates.
   *   The default value is `null`. Possible values are: `null` (don't center),
   *  `horizontal`, `vertical` and `both`.
   */

  /**
   * Scrolls page into view.
   * @param {ScrollPageIntoViewParameters} params
   */
  scrollPageIntoView({
    pageNumber,
    destArray = null,
    allowNegativeOffset = false,
    ignoreDestinationZoom = false,
    center = null,
  }) {
    if (!this.pdfDocument) {
      return;
    }
    const pageView =
      Number.isInteger(pageNumber) && this._pages[pageNumber - 1];
    if (!pageView) {
      NgxConsole.error(
        `scrollPageIntoView: "${pageNumber}" is not a valid pageNumber parameter.`
      );
      return;
    }

    if (this.isInPresentationMode || !destArray) {
      this._setCurrentPageNumber(pageNumber, /* resetCurrentPageView = */ true);
      return;
    }
    let x = 0,
      y = 0;
    let width = 0,
      height = 0,
      widthScale,
      heightScale;
    const changeOrientation = pageView.rotation % 180 !== 0;
    const pageWidth =
      (changeOrientation ? pageView.height : pageView.width) /
      pageView.scale /
      PixelsPerInch.PDF_TO_CSS_UNITS;
    const pageHeight =
      (changeOrientation ? pageView.width : pageView.height) /
      pageView.scale /
      PixelsPerInch.PDF_TO_CSS_UNITS;
    let scale = 0;
    switch (destArray[1].name) {
      case "XYZ":
        x = destArray[2];
        y = destArray[3];
        scale = destArray[4];
        // If x and/or y coordinates are not supplied, default to
        // _top_ left of the page (not the obvious bottom left,
        // since aligning the bottom of the intended page with the
        // top of the window is rarely helpful).
        x = x !== null ? x : 0;
        y = y !== null ? y : pageHeight;
        break;
      case "Fit":
      case "FitB":
        scale = "page-fit";
        break;
      case "FitH":
      case "FitBH":
        y = destArray[2];
        scale = "page-width";
        // According to the PDF spec, section 12.3.2.2, a `null` value in the
        // parameter should maintain the position relative to the new page.
        if (y === null && this._location) {
          x = this._location.left;
          y = this._location.top;
        } else if (typeof y !== "number" || y < 0) {
          // The "top" value isn't optional, according to the spec, however some
          // bad PDF generators will pretend that it is (fixes bug 1663390).
          y = pageHeight;
        }
        break;
      case "FitV":
      case "FitBV":
        x = destArray[2];
        width = pageWidth;
        height = pageHeight;
        scale = "page-height";
        break;
      case "FitR":
        x = destArray[2];
        y = destArray[3];
        width = destArray[4] - x;
        height = destArray[5] - y;
        let hPadding = SCROLLBAR_PADDING,
          vPadding = VERTICAL_PADDING;

        if (
          (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
          this.removePageBorders
        ) {
          hPadding = vPadding = 0;
        }
        widthScale =
          (this.container.clientWidth - hPadding) /
          width /
          PixelsPerInch.PDF_TO_CSS_UNITS;
        heightScale =
          (this.container.clientHeight - vPadding) /
          height /
          PixelsPerInch.PDF_TO_CSS_UNITS;
        scale = Math.min(Math.abs(widthScale), Math.abs(heightScale));
        break;
      default:
        NgxConsole.error(
          `scrollPageIntoView: "${destArray[1].name}" is not a valid destination type.`
        );
        return;
    }

    if (!ignoreDestinationZoom) {
      if (scale && scale !== this._currentScale) {
        this.currentScaleValue = scale;
      } else if (this._currentScale === UNKNOWN_SCALE) {
        this.currentScaleValue = DEFAULT_SCALE_VALUE;
      }
    }

    /** #495 modified by ngx-extended-pdf-viewer */
    this.#ensurePdfPageLoaded(pageView).then(() => {
      this.renderingQueue.renderView(pageView);
      if (this.pageViewMode === "single") {
        if (this.currentPageNumber !== pageNumber) {
          this.currentPageNumber = pageNumber;
        }
      }
    });
    /** end of modification */

    if (scale === "page-fit" && !destArray[4]) {
      this.#scrollIntoView(pageView);
      return;
    }

    const boundingRect = [
      pageView.viewport.convertToViewportPoint(x, y),
      pageView.viewport.convertToViewportPoint(x + width, y + height),
    ];
    let left = Math.min(boundingRect[0][0], boundingRect[1][0]);
    let top = Math.min(boundingRect[0][1], boundingRect[1][1]);

    if (center) {
      if (center === "both" || center === "vertical") {
        top -=
          (this.container.clientHeight -
            Math.abs(boundingRect[1][1] - boundingRect[0][1])) /
          2;
      }
      if (center === "both" || center === "horizontal") {
        left -=
          (this.container.clientWidth -
            Math.abs(boundingRect[1][0] - boundingRect[0][0])) /
          2;
      }
    } else if (!allowNegativeOffset) {
      // Some bad PDF generators will create destinations with e.g. top values
      // that exceeds the page height. Ensure that offsets are not negative,
      // to prevent a previous page from becoming visible (fixes bug 874482).
      left = Math.max(left, 0);
      top = Math.max(top, 0);
    }
    this.#scrollIntoView(pageView, /* pageSpot = */ { left, top });
  }

  _updateLocation(firstPage) {
    const currentScale = this._currentScale;
    const currentScaleValue = this._currentScaleValue;
    const normalizedScaleValue =
      parseFloat(currentScaleValue) === currentScale
        ? Math.round(currentScale * 10000) / 100
        : currentScaleValue;

    const pageNumber = firstPage.id;
    const currentPageView = this._pages[pageNumber - 1];
    const container = this.container;
    // #3069 modified by ngx-extended-pdf-viewer
    // In infinite-scroll mode, container.scrollTop/Left are always 0.
    // Compute the effective scroll offset from the outer scroll container
    // or the window, translated to container-relative coordinates.
    let scrollLeft, scrollTop;
    if (this.pageViewMode === "infinite-scroll") {
      const containerRect = container.getBoundingClientRect();
      if (!this.#outerScrollContainer) {
        this.#outerScrollContainer =
          this.#findAncestorWithScrollbar(this.container);
      }
      const scrollEl = this.#outerScrollContainer;
      if (scrollEl) {
        const scrollRect = scrollEl.getBoundingClientRect();
        scrollLeft = scrollRect.left - containerRect.left;
        scrollTop = scrollRect.top - containerRect.top;
      } else {
        scrollLeft = -containerRect.left;
        scrollTop = -containerRect.top;
      }
    } else {
      scrollLeft = container.scrollLeft;
      scrollTop = container.scrollTop;
    }
    // #3069 end of modification by ngx-extended-pdf-viewer
    const topLeft = currentPageView.getPagePoint(
      scrollLeft - firstPage.x,
      scrollTop - firstPage.y
    );
    const intLeft = Math.round(topLeft[0]);
    const intTop = Math.round(topLeft[1]);

    let pdfOpenParams = `#page=${pageNumber}`;
    if (!this.isInPresentationMode) {
      pdfOpenParams += `&zoom=${normalizedScaleValue},${intLeft},${intTop}`;
    }

    this._location = {
      pageNumber,
      scale: normalizedScaleValue,
      top: intTop,
      left: intLeft,
      rotation: this._pagesRotation,
      pdfOpenParams,
    };
  }

  update(noScroll = false) { // #2275 modified by ngx-extended-pdf-viewer
    // #1201 modified by ngx-extended-pdf-viewer
    if (this.scrollMode === ScrollMode.PAGE) {
      this.viewer.classList.add("singlePageView");
    } else {
      this.viewer.classList.remove("singlePageView");
    }
    // #1201 end of modification by ngx-extended-pdf-viewer

    const visible = this._getVisiblePages();
    const visiblePages = visible.views,
      numVisiblePages = visiblePages.length;

    if (numVisiblePages === 0) {
      return;
    }
    // #950 modified by ngx-extended-pdf-viewer
    const bufferSize = this.defaultCacheSize || DEFAULT_CACHE_SIZE;
    const newCacheSize = Math.max(bufferSize, 2 * numVisiblePages + 1);
    // #950 end of modification
    this.#buffer.resize(newCacheSize, visible.ids);

    for (const { view, visibleArea } of visiblePages) {
      view.updateVisibleArea(visibleArea);
    }
    for (const view of this.#buffer) {
      if (!visible.ids.has(view.id)) {
        view.updateVisibleArea(null);
      }
    }

    this.renderingQueue.renderHighestPriority(visible);

    const isSimpleLayout =
      this._spreadMode === SpreadMode.NONE &&
      (this._scrollMode === ScrollMode.PAGE ||
        this._scrollMode === ScrollMode.VERTICAL);
    const currentPageNumber = this._currentPageNumber;
    let stillFullyVisible = false;

    for (const page of visiblePages) {
      if (page.percent < 100) {
        break;
      }
      if (page.id === currentPageNumber && isSimpleLayout) {
        stillFullyVisible = true;
        break;
      }
    }
    // #1808 modified by ngx-extended-pdf-viewer
    // stop the infinite loop in presentation mode with [(page)]
    // #3069 modified by ngx-extended-pdf-viewer
    // In infinite-scroll mode, suppress page-number resets for 500ms
    // after a programmatic navigation. Without this, the debounced
    // update() call sees stale visible pages and resets back to page 1,
    // which triggers Angular's pagechanging handler to navigate back.
    const navigationSettling = this.pageViewMode === "infinite-scroll" &&
      Date.now() - this.#lastNavigationTime < 500;
    if (this.scrollMode !== ScrollMode.PAGE && !noScroll && !navigationSettling) { // #2275 modified by ngx-extended-pdf-viewer
      this._setCurrentPageNumber(
        stillFullyVisible ? this._currentPageNumber : visiblePages[0].id
      );
    }
    // #3069 end of modification by ngx-extended-pdf-viewer

    // #2828 modified by ngx-extended-pdf-viewer - now the location is always
    // updated, preventing the page to jump to page 1 after zooming
    this._updateLocation(visible.first);
    this.eventBus.dispatch("updateviewarea", {
      source: this,
      location: this._location,
    });

    // #1808 end of modification by ngx-extended-pdf-viewer
    // #859 modified by ngx-extended-pdf-viewer
    this.hidePagesDependingOnpageViewMode();
    // #859 end of modification
  }

  async updateBookModeScale(evt) {
    if (this.pageViewMode === "book") {
      if (this.pageFlip) {
        if (evt.scale && evt.scale !== evt.previousScale) {
          // resize the page
          const page = this._pages[0];
          if (page.pdfPage) {
            const width = page.width;
            const height = page.height;
            const block = page.div.parentElement;

            const borderWith = this.removePageBorders ? 1 : 40;
            block.style.width = `${2 * width + borderWith}px`;
            block.style.height = `${height}px`;
            this.pageFlip.render.setting.width = width;
            this.pageFlip.render.setting.height = height;
            this.pageFlip.render.update();
          }
        }
      }
    }
  }

  #switchToEditAnnotationMode() {
    const visible = this._getVisiblePages();
    const pagesToRefresh = [];
    const { ids, views } = visible;
    for (const page of views) {
      const { view } = page;
      if (!view.hasEditableAnnotations()) {
        ids.delete(view.id);
        continue;
      }
      pagesToRefresh.push(page);
    }

    if (pagesToRefresh.length === 0) {
      return null;
    }
    this.renderingQueue.renderHighestPriority({
      first: pagesToRefresh[0],
      last: pagesToRefresh.at(-1),
      views: pagesToRefresh,
      ids,
    });

    return ids;
  }

  containsElement(element) {
    return this.container.contains(element);
  }

  focus() {
    this.container.focus();
  }

  get _isContainerRtl() {
    return getComputedStyle(this.container).direction === "rtl";
  }

  get isInPresentationMode() {
    return this.presentationModeState === PresentationModeState.FULLSCREEN;
  }

  get isChangingPresentationMode() {
    return this.presentationModeState === PresentationModeState.CHANGING;
  }

  get isHorizontalScrollbarEnabled() {
    return this.isInPresentationMode
      ? false
      : this.container.scrollWidth > this.container.clientWidth;
  }

  get isVerticalScrollbarEnabled() {
    return this.isInPresentationMode
      ? false
      : this.container.scrollHeight > this.container.clientHeight;
  }

  _getVisiblePages() {
    const views =
        this._scrollMode === ScrollMode.PAGE
          ? this.#scrollModePageState.pages
          : this._pages,
      horizontal = this._scrollMode === ScrollMode.HORIZONTAL,
      rtl = horizontal && this._isContainerRtl;

    // #3155 modified by ngx-extended-pdf-viewer
    if (this._isContainerRtl && (horizontal || this._scrollMode === ScrollMode.WRAPPED)) {
      return this._getVisiblePagesRtl(views);
    }
    // #3155 end of modification by ngx-extended-pdf-viewer

    // #3069 modified by ngx-extended-pdf-viewer
    if (this.pageViewMode === "infinite-scroll") {
      return this.#getVisiblePagesInfiniteScroll(views);
    }
    // #3069 end of modification by ngx-extended-pdf-viewer

    return getVisibleElements({
      scrollEl: this.container,
      views,
      sortByVisibility: true,
      horizontal,
      rtl,
    });
  }

  // #3155 modified by ngx-extended-pdf-viewer
  _getVisiblePagesRtl(views) {
    const containerRect = this.container.getBoundingClientRect();
    const visible = [];
    const ids = new Set();

    for (const view of views) {
      const element = view.div;
      const rect = element.getBoundingClientRect();

      const overlapLeft = Math.max(rect.left, containerRect.left);
      const overlapRight = Math.min(rect.right, containerRect.right);
      const overlapTop = Math.max(rect.top, containerRect.top);
      const overlapBottom = Math.min(rect.bottom, containerRect.bottom);

      const visibleWidth = Math.max(0, overlapRight - overlapLeft);
      const visibleHeight = Math.max(0, overlapBottom - overlapTop);

      if (visibleWidth === 0 || visibleHeight === 0) {
        continue;
      }

      const fractionWidth = visibleWidth / rect.width;
      const fractionHeight = visibleHeight / rect.height;
      const percent = (fractionWidth * fractionHeight * 100) | 0;

      visible.push({
        id: view.id,
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        view,
        percent,
        widthPercent: (fractionWidth * 100) | 0,
      });
      ids.add(view.id);
    }

    // Sort by position: rightmost first (highest x = first in RTL reading order)
    visible.sort((a, b) => b.x - a.x);

    const first = visible[0];
    const last = visible.at(-1);

    return { first, last, views: visible, ids };
  }
  // #3155 end of modification by ngx-extended-pdf-viewer

  // #3069 modified by ngx-extended-pdf-viewer
  // In infinite-scroll mode, determine visibility using the outer scroll
  // container's (or window's) viewport via getBoundingClientRect, since
  // the inner container has no scrollbar.
  #getVisiblePagesInfiniteScroll(views) {
    if (!this.#outerScrollContainer) {
      this.#outerScrollContainer =
        this.#findAncestorWithScrollbar(this.container);
    }
    const scrollEl = this.#outerScrollContainer;
    let viewportRect;
    if (scrollEl) {
      viewportRect = scrollEl.getBoundingClientRect();
    } else {
      // Fallback: use the window as the viewport
      viewportRect = {
        top: 0,
        left: 0,
        bottom: window.innerHeight,
        right: window.innerWidth,
      };
    }
    const visible = [];
    const ids = new Set();

    for (const view of views) {
      const element = view.div;
      const rect = element.getBoundingClientRect();

      const overlapLeft = Math.max(rect.left, viewportRect.left);
      const overlapRight = Math.min(rect.right, viewportRect.right);
      const overlapTop = Math.max(rect.top, viewportRect.top);
      const overlapBottom = Math.min(rect.bottom, viewportRect.bottom);

      const visibleWidth = Math.max(0, overlapRight - overlapLeft);
      const visibleHeight = Math.max(0, overlapBottom - overlapTop);

      if (visibleWidth === 0 || visibleHeight === 0) {
        continue;
      }

      const fractionWidth = visibleWidth / rect.width;
      const fractionHeight = visibleHeight / rect.height;
      const percent = (fractionWidth * fractionHeight * 100) | 0;

      // Compute visibleArea for partial-page rendering support.
      // Coordinates are relative to the page element's top-left.
      const minX = Math.max(0, viewportRect.left - rect.left);
      const minY = Math.max(0, viewportRect.top - rect.top);
      const maxX = Math.min(rect.width, viewportRect.right - rect.left);
      const maxY = Math.min(rect.height, viewportRect.bottom - rect.top);

      // Use offsetLeft/offsetTop (relative to container) for x/y so that
      // _updateLocation and other consumers get container-relative coords,
      // consistent with the normal getVisibleElements path.
      visible.push({
        id: view.id,
        x: element.offsetLeft + element.clientLeft,
        y: element.offsetTop + element.clientTop,
        visibleArea: percent === 100 ? null : { minX, minY, maxX, maxY },
        view,
        percent,
        widthPercent: (fractionWidth * 100) | 0,
      });
      ids.add(view.id);
    }

    // Sort by visibility percentage (most visible first), stable by id.
    visible.sort((a, b) => {
      const pc = a.percent - b.percent;
      if (Math.abs(pc) > 0.001) {
        return -pc;
      }
      return a.id - b.id;
    });

    const first = visible[0];
    const last = visible.at(-1);

    return { first, last, views: visible, ids };
  }
  // #3069 end of modification by ngx-extended-pdf-viewer

  cleanup() {
    for (const pageView of this._pages) {
      if (pageView.renderingState !== RenderingStates.FINISHED) {
        pageView.reset();
      }
    }
  }

  /**
   * @private
   */
  _cancelRendering() {
    for (const pageView of this._pages) {
      pageView.cancelRendering();
    }
  }

  /**
   * @param {PDFPageView} pageView
   * @returns {Promise<PDFPageProxy | null>}
   */
  async #ensurePdfPageLoaded(pageView) {
    if (pageView.pdfPage) {
      return pageView.pdfPage;
    }
    try {
      const pdfPage = await this.pdfDocument.getPage(pageView.id);
      if (!pageView.pdfPage) {
        pageView.setPdfPage(pdfPage);
      }
      return pdfPage;
    } catch (reason) {
      NgxConsole.error("Unable to get page for page view", reason);
      return null; // Page error -- there is nothing that can be done.
    }
  }

  #getScrollAhead(visible) {
    if (visible.first?.id === 1) {
      return true;
    } else if (visible.last?.id === this.pagesCount) {
      return false;
    }
    switch (this._scrollMode) {
      case ScrollMode.PAGE:
        return this.#scrollModePageState.scrollDown;
      case ScrollMode.HORIZONTAL:
        return this.scroll.right;
    }
    return this.scroll.down;
  }

  forceRendering(currentlyVisiblePages) {
    const visiblePages = currentlyVisiblePages || this._getVisiblePages();
    const scrollAhead = this.#getScrollAhead(visiblePages);
    const preRenderExtra =
      this._spreadMode !== SpreadMode.NONE &&
      this._scrollMode !== ScrollMode.HORIZONTAL;

    const ignoreDetailViews =
      // If we are zooming, do not re-render the detail views. Re-renders on
      // zoom happen with a delay, and once the rendering happens it will also
      // trigger rendering of the detail views.
      this.#scaleTimeoutId !== null ||
      // If we are scrolling and the rendering of a detail view was just
      // cancelled, it's because the user is scrolling too quickly and so
      // we constantly need to re-render a different area.
      // Don't attempt to re-render it: this will be done once the user
      // stops scrolling.
      (this.#scrollTimeoutId !== null &&
        visiblePages.views.some(page => page.detailView?.renderingCancelled));

    const pageView = this.renderingQueue.getHighestPriority(
      visiblePages,
      this._pages,
      scrollAhead,
      preRenderExtra,
      ignoreDetailViews
    );

    if (pageView) {
      this.#ensurePdfPageLoaded(pageView).then(() => {
        this.renderingQueue.renderView(pageView);
      });
      return true;
    }
    return false;
  }

  /**
   * @type {boolean} Whether all pages of the PDF document have identical
   *   widths and heights.
   */
  get hasEqualPageSizes() {
    const firstPageView = this._pages[0];
    for (let i = 1, ii = this._pages.length; i < ii; ++i) {
      const pageView = this._pages[i];
      if (
        pageView.width !== firstPageView.width ||
        pageView.height !== firstPageView.height
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns sizes of the pages.
   * @returns {Array} Array of objects with width/height/rotation fields.
   */
  getPagesOverview() {
    let initialOrientation;
    return this._pages.map(pageView => {
      const viewport = pageView.pdfPage.getViewport({ scale: 1 });
      const orientation = isPortraitOrientation(viewport);
      if (initialOrientation === undefined) {
        initialOrientation = orientation;
      } else if (
        this.enablePrintAutoRotate &&
        orientation !== initialOrientation
      ) {
        // Rotate to fit the initial orientation.
        return {
          width: viewport.height,
          height: viewport.width,
          rotation: (viewport.rotation - 90) % 360,
        };
      }
      return {
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
      };
    });
  }

  /**
   * @type {Promise<OptionalContentConfig | null>}
   */
  get optionalContentConfigPromise() {
    if (!this.pdfDocument) {
      return Promise.resolve(null);
    }
    if (!this._optionalContentConfigPromise) {
      NgxConsole.error("optionalContentConfigPromise: Not initialized yet.");
      // Prevent issues if the getter is accessed *before* the `onePageRendered`
      // promise has resolved; won't (normally) happen in the default viewer.
      return this.pdfDocument.getOptionalContentConfig({ intent: "display" });
    }
    return this._optionalContentConfigPromise;
  }

  /**
   * @param {Promise<OptionalContentConfig>} promise - A promise that is
   *   resolved with an {@link OptionalContentConfig} instance.
   */
  set optionalContentConfigPromise(promise) {
    if (!(promise instanceof Promise)) {
      throw new Error(`Invalid optionalContentConfigPromise: ${promise}`);
    }
    if (!this.pdfDocument) {
      return;
    }
    if (!this._optionalContentConfigPromise) {
      // Ignore the setter *before* the `onePageRendered` promise has resolved,
      // since it'll be overwritten anyway; won't happen in the default viewer.
      return;
    }
    this._optionalContentConfigPromise = promise;

    this.refresh(false, { optionalContentConfigPromise: promise });

    this.eventBus.dispatch("optionalcontentconfigchanged", {
      source: this,
      promise,
    });
  }

  /**
   * @type {number} One of the values in {ScrollMode}.
   */
  get scrollMode() {
    return this._scrollMode;
  }

  /**
   * @param {number} mode - The direction in which the document pages should be
   *   laid out within the scrolling container.
   *   The constants from {ScrollMode} should be used.
   */
  set scrollMode(mode) {
    if (
      typeof PDFJSDev === "undefined"
        ? window.isGECKOVIEW
        : PDFJSDev.test("GECKOVIEW")
    ) {
      // NOTE: Always ignore the pageLayout in GeckoView since there's
      // no UI available to change Scroll/Spread modes for the user.
      return;
    }
    if (this._scrollMode === mode) {
      return; // The Scroll mode didn't change.
    }
    if (!isValidScrollMode(mode)) {
      throw new Error(`Invalid scroll mode: ${mode}`);
    }
    if (this.pagesCount > PagesCountLimit.FORCE_SCROLL_MODE_PAGE) {
      return; // Disabled for performance reasons.
    }
    this._previousScrollMode = this._scrollMode;

    this._scrollMode = mode;
    this.eventBus.dispatch("scrollmodechanged", { source: this, mode });

    // #2673 modified by ngx-extended-pdf-viewer
    // When switching to PAGE mode (single page),
    // reset pageViewMode from infinite-scroll
    if (mode === ScrollMode.PAGE && this.#pageViewMode === "infinite-scroll") {
      this.#pageViewMode = "single";
      this.hidePagesDependingOnpageViewMode();
      // Notify that we've switched away from infinite-scroll so height can be restored
      queueMicrotask(() => {
        this.eventBus.dispatch("pageviewmodechanged", {
          source: this,
          mode: this.#pageViewMode
        });
      });
    }
    // #2673 end of modification by ngx-extended-pdf-viewer

    this._updateScrollMode(/* pageNumber = */ this._currentPageNumber);
  }

  _updateScrollMode(pageNumber = null) {
    const scrollMode = this._scrollMode,
      viewer = this.viewer;

    viewer.classList.toggle(
      "scrollHorizontal",
      scrollMode === ScrollMode.HORIZONTAL
    );
    viewer.classList.toggle("scrollWrapped", scrollMode === ScrollMode.WRAPPED);

    if (!this.pdfDocument || !pageNumber) {
      return;
    }

    if (scrollMode === ScrollMode.PAGE) {
      this.#ensurePageViewVisible();
    } else if (this._previousScrollMode === ScrollMode.PAGE) {
      // Ensure that the current spreadMode is still applied correctly when
      // the *previous* scrollMode was `ScrollMode.PAGE`.
      this._updateSpreadMode();
    }
    // Non-numeric scale values can be sensitive to the scroll orientation.
    // Call this before re-scrolling to the current page, to ensure that any
    // changes in scale don't move the current page.
    if (this._currentScaleValue && isNaN(this._currentScaleValue)) {
      this.#setScale(this._currentScaleValue, { noScroll: true });
    }
    this._setCurrentPageNumber(pageNumber, /* resetCurrentPageView = */ true);
    this.update();
  }

  /**
   * @type {number} One of the values in {SpreadMode}.
   */
  get spreadMode() {
    return this._spreadMode;
  }

  /**
   * @param {number} mode - Group the pages in spreads, starting with odd- or
   *   even-number pages (unless `SpreadMode.NONE` is used).
   *   The constants from {SpreadMode} should be used.
   */
  set spreadMode(mode) {
    if (
      typeof PDFJSDev === "undefined"
        ? window.isGECKOVIEW
        : PDFJSDev.test("GECKOVIEW")
    ) {
      // NOTE: Always ignore the pageLayout in GeckoView since there's
      // no UI available to change Scroll/Spread modes for the user.
      return;
    }
    if (this._spreadMode === mode) {
      return; // The Spread mode didn't change.
    }
    if (!isValidSpreadMode(mode)) {
      throw new Error(`Invalid spread mode: ${mode}`);
    }
    this._spreadMode = mode;
    this.eventBus.dispatch("spreadmodechanged", { source: this, mode });

    this._updateSpreadMode(/* pageNumber = */ this._currentPageNumber);
  }

  _updateSpreadMode(pageNumber = null) {
    if (!this.pdfDocument) {
      return;
    }
    const viewer = this.viewer,
      pages = this._pages;

    if (this._scrollMode === ScrollMode.PAGE) {
      this.#ensurePageViewVisible();
    } else {
      // Temporarily remove all the pages from the DOM.
      viewer.textContent = "";

      if (this._spreadMode === SpreadMode.NONE) {
        for (const pageView of this._pages) {
          viewer.append(pageView.div);
        }
      } else {
        const parity = this._spreadMode - 1;
        let spread = null;
        for (let i = 0, ii = pages.length; i < ii; ++i) {
          if (spread === null) {
            spread = document.createElement("div");
            spread.className = "spread";
            viewer.append(spread);
          } else if (i % 2 === parity) {
            spread = spread.cloneNode(false);
            viewer.append(spread);
          }
          spread.append(pages[i].div);
        }
      }
    }

    // #859 modified by ngx-extended-pdf-viewer
    this.hidePagesDependingOnpageViewMode();
    // end of modification by ngx-extended-pdf-viewer

    if (!pageNumber) {
      return;
    }
    // Non-numeric scale values can be sensitive to the scroll orientation.
    // Call this before re-scrolling to the current page, to ensure that any
    // changes in scale don't move the current page.
    if (this._currentScaleValue && isNaN(this._currentScaleValue)) {
      this.#setScale(this._currentScaleValue, { noScroll: true });
    }
    this._setCurrentPageNumber(pageNumber, /* resetCurrentPageView = */ true);
    this.update();
  }

  // #1695 modified by ngx-extended-pdf-viewer
  #getPageAdvance(currentPageNumber, previous = false) {
    if (this.pageViewMode === "book") {
      return 2;
    }
    // #1695 end of modification by ngx-extended-pdf-viewer
    switch (this._scrollMode) {
      case ScrollMode.WRAPPED: {
        const { views } = this._getVisiblePages(),
          pageLayout = new Map();

        // Determine the current (visible) page layout.
        for (const { id, y, percent, widthPercent } of views) {
          if (percent === 0 || widthPercent < 100) {
            continue;
          }
          pageLayout.getOrInsertComputed(y, makeArr).push(id);
        }
        // Find the row of the current page.
        for (const yArray of pageLayout.values()) {
          const currentIndex = yArray.indexOf(currentPageNumber);
          if (currentIndex === -1) {
            continue;
          }
          const numPages = yArray.length;
          if (numPages === 1) {
            break;
          }
          // Handle documents with varying page sizes.
          if (previous) {
            for (let i = currentIndex - 1, ii = 0; i >= ii; i--) {
              const currentId = yArray[i],
                expectedId = yArray[i + 1] - 1;
              if (currentId < expectedId) {
                return currentPageNumber - expectedId;
              }
            }
          } else {
            for (let i = currentIndex + 1, ii = numPages; i < ii; i++) {
              const currentId = yArray[i],
                expectedId = yArray[i - 1] + 1;
              if (currentId > expectedId) {
                return expectedId - currentPageNumber;
              }
            }
          }
          // The current row is "complete", advance to the previous/next one.
          if (previous) {
            const firstId = yArray[0];
            if (firstId < currentPageNumber) {
              return currentPageNumber - firstId + 1;
            }
          } else {
            const lastId = yArray[numPages - 1];
            if (lastId > currentPageNumber) {
              return lastId - currentPageNumber + 1;
            }
          }
          break;
        }
        break;
      }
      case ScrollMode.HORIZONTAL: {
        break;
      }
      case ScrollMode.PAGE:
      case ScrollMode.VERTICAL: {
        if (this._spreadMode === SpreadMode.NONE) {
          break; // Normal vertical scrolling.
        }
        const parity = this._spreadMode - 1;

        if (previous && currentPageNumber % 2 !== parity) {
          break; // Left-hand side page.
        } else if (!previous && currentPageNumber % 2 === parity) {
          break; // Right-hand side page.
        }
        const { views } = this._getVisiblePages(),
          expectedId = previous ? currentPageNumber - 1 : currentPageNumber + 1;

        for (const { id, percent, widthPercent } of views) {
          if (id !== expectedId) {
            continue;
          }
          if (percent > 0 && widthPercent === 100) {
            return 2;
          }
          break;
        }
        break;
      }
    }
    return 1;
  }

  /**
   * Go to the next page, taking scroll/spread-modes into account.
   * @returns {boolean} Whether navigation occurred.
   */
  nextPage() {
    const currentPageNumber = this._currentPageNumber,
      pagesCount = this.pagesCount;

    if (currentPageNumber >= pagesCount) {
      return false;
    }
    const advance =
      this.#getPageAdvance(currentPageNumber, /* previous = */ false) || 1;

    this.currentPageNumber = Math.min(currentPageNumber + advance, pagesCount);
    return true;
  }

  /**
   * Go to the previous page, taking scroll/spread-modes into account.
   * @returns {boolean} Whether navigation occurred.
   */
  previousPage() {
    const currentPageNumber = this._currentPageNumber;

    if (currentPageNumber <= 1) {
      return false;
    }
    const advance =
      this.#getPageAdvance(currentPageNumber, /* previous = */ true) || 1;

    this.currentPageNumber = Math.max(currentPageNumber - advance, 1);
    return true;
  }

  /**
   * @typedef {Object} ChangeScaleOptions
   * @property {number} [drawingDelay]
   * @property {number} [scaleFactor]
   * @property {number} [steps]
   * @property {Array} [origin] x and y coordinates of the scale
   *                            transformation origin.
   */

  /**
   * Changes the current zoom level by the specified amount.
   * @param {ChangeScaleOptions} [options]
   */
  updateScale({ drawingDelay, scaleFactor = null, steps = null, origin }) {
    if (steps === null && scaleFactor === null) {
      throw new Error(
        "Invalid updateScale options: either `steps` or `scaleFactor` must be provided."
      );
    }
    if (!this.pdfDocument) {
      return;
    }
    let newScale = this._currentScale;
    if (scaleFactor > 0 && scaleFactor !== 1) {
      // #3069 modified by ngx-extended-pdf-viewer
      // Use 0.1% precision (1000) during pinch for smoother increments.
      // The scale snaps to whole percentages when the gesture ends.
      newScale = Math.round(newScale * scaleFactor * 1000) / 1000;
      // #3069 end of modification by ngx-extended-pdf-viewer
    } else if (steps) {
      const delta = steps > 0 ? DEFAULT_SCALE_DELTA : 1 / DEFAULT_SCALE_DELTA;
      const round = steps > 0 ? Math.ceil : Math.floor;
      steps = Math.abs(steps);
      do {
        newScale = round((newScale * delta).toFixed(2) * 10) / 10;
      } while (--steps > 0);
    }
    // modified by ngx-extended-pdf-viewer #367
    const minScale = Number(this.minZoom) ?? MIN_SCALE;
    const maxScale = Number(this.maxZoom) ?? MAX_SCALE;
    newScale = MathClamp(newScale, minScale, maxScale);
    this.#setScale(newScale, { noScroll: false, drawingDelay, origin });
    // #367 end of modification by ngx-extended-pdf-viewer
  }

  /**
   * Increase the current zoom level one, or more, times.
   * @param {ChangeScaleOptions} [options]
   */
  increaseScale(options = {}) {
    this.updateScale({ ...options, steps: options.steps ?? 1 });
  }

  /**
   * Decrease the current zoom level one, or more, times.
   * @param {ChangeScaleOptions} [options]
   */
  decreaseScale(options = {}) {
    this.updateScale({ ...options, steps: -(options.steps ?? 1) });
  }

  #updateContainerHeightCss(height = this.container.clientHeight) {
    if (height !== this.#previousContainerHeight) {
      this.#previousContainerHeight = height;
      docStyle.setProperty("--viewer-container-height", `${height}px`);
    }
  }

  #resizeObserverCallback(entries) {
    for (const entry of entries) {
      if (entry.target === this.container) {
        this.#updateContainerHeightCss(
          Math.floor(entry.borderBoxSize[0].blockSize)
        );
        this.#containerTopLeft = null;
        break;
      }
    }
  }

  get containerTopLeft() {
    return (this.#containerTopLeft ||= [
      this.container.offsetTop,
      this.container.offsetLeft,
    ]);
  }

  #cleanupTimeouts() {
    if (this.#scaleTimeoutId !== null) {
      clearTimeout(this.#scaleTimeoutId);
      this.#scaleTimeoutId = null;
    }
    if (this.#scrollTimeoutId !== null) {
      clearTimeout(this.#scrollTimeoutId);
      this.#scrollTimeoutId = null;
    }
  }

  #cleanupSwitchAnnotationEditorMode() {
    this.#switchAnnotationEditorModeAC?.abort();
    this.#switchAnnotationEditorModeAC = null;

    if (this.#switchAnnotationEditorModeTimeoutId !== null) {
      clearTimeout(this.#switchAnnotationEditorModeTimeoutId);
      this.#switchAnnotationEditorModeTimeoutId = null;
    }
  }

  #preloadEditingData(mode) {
    switch (mode) {
      case AnnotationEditorType.STAMP:
        this.#mlManager?.loadModel("altText");
        break;
      case AnnotationEditorType.SIGNATURE:
        // Start to load the signature data.
        this.#signatureManager?.loadSignatures();
        break;
    }
  }

  get annotationEditorMode() {
    return this.#annotationEditorUIManager
      ? this.#annotationEditorMode
      : AnnotationEditorType.DISABLE;
  }

  /**
   * @typedef {Object} AnnotationEditorModeOptions
   * @property {number} mode - The editor mode (none, FreeText, ink, ...).
   * @property {string|null} [editId] - ID of the existing annotation to edit.
   * @property {boolean} [isFromKeyboard] - True if the mode change is due to a
   *   keyboard action.
   * @property {boolean} [mustEnterInEditMode] - True if the editor must enter
   *   edit mode.
   * @property {boolean} [editComment] - True if the editor must enter
   *   comment edit mode.
   */

  /**
   * @param {AnnotationEditorModeOptions} options
   */
  set annotationEditorMode({
    mode,
    editId = null,
    isFromKeyboard = false,
    mustEnterInEditMode = false,
    editComment = false,
  }) {
    if (!this.#annotationEditorUIManager) {
      throw new Error(`The AnnotationEditor is not enabled.`);
    }
    if (this.#annotationEditorMode === mode) {
      return; // The AnnotationEditor mode didn't change.
    }
    if (!isValidAnnotationEditorMode(mode)) {
      throw new Error(`Invalid AnnotationEditor mode: ${mode}`);
    }
    if (!this.pdfDocument) {
      return;
    }
    this.#preloadEditingData(mode);

    const { eventBus, pdfDocument } = this;
    const updater = async () => {
      this.#cleanupSwitchAnnotationEditorMode();
      this.#annotationEditorMode = mode;
      await this.#annotationEditorUIManager.updateMode(
        mode,
        editId,
        /* isFromUser = */ true,
        isFromKeyboard,
        mustEnterInEditMode,
        editComment
      );
      if (
        mode !== this.#annotationEditorMode ||
        pdfDocument !== this.pdfDocument
      ) {
        // Since `updateMode` is async, the active mode could have changed.
        return;
      }
      eventBus.dispatch("annotationeditormodechanged", {
        source: this,
        mode,
      });
    };

    if (
      mode === AnnotationEditorType.NONE ||
      this.#annotationEditorMode === AnnotationEditorType.NONE
    ) {
      const isEditing = mode !== AnnotationEditorType.NONE;
      if (!isEditing) {
        this.pdfDocument.annotationStorage.resetModifiedIds();
      }
      // We need to cleanup whatever pages being rendered.
      this.cleanup();
      for (const pageView of this._pages) {
        pageView.toggleEditingMode(isEditing);
      }
      // We must call #switchToEditAnnotationMode unconditionally to ensure that
      // page is rendered if it's useful or not.
      const idsToRefresh = this.#switchToEditAnnotationMode();
      if (isEditing && idsToRefresh) {
        // We're editing so we must switch to editing mode when the rendering is
        // done.
        this.#cleanupSwitchAnnotationEditorMode();
        this.#switchAnnotationEditorModeAC = new AbortController();
        const signal = AbortSignal.any([
          this.#eventAbortController.signal,
          this.#switchAnnotationEditorModeAC.signal,
        ]);

        eventBus._on(
          "pagerendered",
          ({ pageNumber }) => {
            idsToRefresh.delete(pageNumber);
            if (idsToRefresh.size === 0) {
              this.#switchAnnotationEditorModeTimeoutId = setTimeout(
                updater,
                0
              );
            }
          },
          { signal }
        );
        return;
      }
    }
    updater();
  }

  refresh(noUpdate = false, updateArgs = Object.create(null)) {
    if (!this.pdfDocument) {
      return;
    }
    for (const pageView of this._pages) {
      pageView.update(updateArgs);
    }
    this.#cleanupTimeouts();

    if (!noUpdate) {
      this.update();
    }
  }

  // #1783 modified by ngx-extended-pdf-viewer
  // Method added for ngx-extended-pdf-viewer to export editor annotations
  getSerializedAnnotations() {
    const annotationStorage = this.pdfDocument.annotationStorage;

    // Check if there are any annotations in storage
    if (annotationStorage.size === 0) {
      return null;
    }

    const annotations = [];

    for (const [key, annotation] of annotationStorage) {
      if (annotation && typeof annotation.serialize === "function") {
        // #3038 modified by ngx-extended-pdf-viewer
        // Use isForCopying=true to ensure plain arrays instead of TypedArrays
        // for proper JSON serialization, but pass includeId=true to get IDs
        const serialized = annotation.serialize(true, null, true);
        // #3038 end of modification by ngx-extended-pdf-viewer
        if (serialized && serialized.annotationType !== undefined) {
          annotations.push(serialized);
        }
      }
    }

    return annotations.length > 0 ? annotations : null;
  }

  // Method added for ngx-extended-pdf-viewer to import editor annotations
  async addEditorAnnotation(data) {
    try {
      // #1783 modified by ngx-extended-pdf-viewer
      if (typeof data === "string") {
        data = JSON.parse(data);
      }
      // #1783 end of modification by ngx-extended-pdf-viewer
    } catch (ex) {
      NgxConsole.error(`Please pass a JSON string or an Array of JSON objects to addEditorAnnotation: "${ex.message}".`);
      return;
    }
    if (!Array.isArray(data)) {
      data = [data];
    }

    // #3038 modified by ngx-extended-pdf-viewer
    // Convert legacy object-with-numeric-keys format to arrays (backwards compatibility)
    const convertArrayLikeObjectToArray = (obj) => {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return obj;
      }
      const keys = Object.keys(obj);
      // Check if all keys are numeric indices
      if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
        const arr = [];
        for (let i = 0; i < keys.length; i++) {
          arr[i] = obj[i];
        }
        return arr;
      }
      return obj;
    };

    let hasLegacyFormat = false;
    data?.forEach(annotation => {
      annotation.isCopy = true;
      // Fix ink editor annotations with legacy format
      if (annotation.annotationType === 15 && annotation.paths) {
        if (annotation.paths.lines) {
          const convertedLines = annotation.paths.lines.map(convertArrayLikeObjectToArray);
          if (convertedLines.some((line, i) => line !== annotation.paths.lines[i])) {
            hasLegacyFormat = true;
            annotation.paths.lines = convertedLines;
          }
        }
        if (annotation.paths.points) {
          const convertedPoints = annotation.paths.points.map(convertArrayLikeObjectToArray);
          if (convertedPoints.some((point, i) => point !== annotation.paths.points[i])) {
            hasLegacyFormat = true;
            annotation.paths.points = convertedPoints;
          }
        }
      }
    });

    if (hasLegacyFormat) {
      NgxConsole.warn(
        "Detected and converted legacy ink annotation format (object-with-numeric-keys) to arrays. " +
        "This format was used in ngx-extended-pdf-viewer versions 22.x - 25.5.x. " +
        "Please re-export or convert your annotations to use the correct format. " +
        "The objects with numeric keys were always meant to be arrays."
      );
    }
    // #3038 end of modification by ngx-extended-pdf-viewer

    await this.#annotationEditorUIManager.addSerializedEditor(data, true, true, false);
  }

  // Method added for ngx-extended-pdf-viewer to remove editor annotations
  removeEditorAnnotations(filter = () => true) {
    this.#annotationEditorUIManager.removeEditors(filter);
  }
  // #1783 end of modification by ngx-extended-pdf-viewer

  // #1415 modified by ngx-extended-pdf-viewer
  destroyBookMode() {
    if (this.pageFlip) {
      this.pageFlip.destroy();
      this.pageFlip = null;
    }
  }

  stopRendering() {
    // this.renderingQueue._stop();
    this._cancelRendering();
  }
  // #1415 end of modification by ngx-extended-pdf-viewer
}

export { PagesCountLimit, PDFPageViewBuffer, PDFViewer };
