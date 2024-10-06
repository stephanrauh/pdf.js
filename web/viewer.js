/* Copyright 2016 Mozilla Foundation
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

import { RenderingStates, ScrollMode, SpreadMode } from "./ui_utils.js";
import { AppOptions } from "./app_options.js";
import { LinkTarget } from "./pdf_link_service.js";
import { PDFViewerApplication } from "./app.js";

/* eslint-disable-next-line no-unused-vars */
const pdfjsVersion =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_VERSION") : void 0;
/* eslint-disable-next-line no-unused-vars */
const pdfjsBuild =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_BUILD") : void 0;

const AppConstants =
  typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")
    ? { LinkTarget, RenderingStates, ScrollMode, SpreadMode }
    : null;

// #2337 modified by ngx-extended-pdf-viewer
// window.PDFViewerApplication = PDFViewerApplication;
// window.PDFViewerApplicationConstants = AppConstants;
// window.PDFViewerApplicationOptions = AppOptions;
// #2337 end of modification by ngx-extended-pdf-viewer

// modified by ngx-extended-pdf-viewer
if (!HTMLCollection.prototype[Symbol.iterator]) {
  HTMLCollection.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
}
(function () {
  if (typeof window.CustomEvent === "function") {
    return;
  }

  function CustomEvent(event, params) {
    params = params || { bubbles: false, cancelable: false, detail: null };
    const evt = document.createEvent("CustomEvent");
    evt.initCustomEvent(
      event,
      params.bubbles,
      params.cancelable,
      params.detail
    );
    return evt;
  }

  window.CustomEvent = CustomEvent;
})();
// end of modification


function getViewerConfiguration() {
  return {
    appContainer: document.body,
    principalContainer: document.getElementById("mainContainer"),
    mainContainer: document.getElementById("viewerContainer"),
    viewerContainer: document.getElementById("viewer"),
    toolbar: {
      container: document.getElementById("toolbarContainer"),
      numPages: document.getElementById("numPages"),
      pageNumber: document.getElementById("pageNumber"),
      scaleSelect: document.getElementById("scaleSelect"),
      customScaleOption: document.getElementById("customScaleOption"),
      previous: document.getElementById("previous"),
      next: document.getElementById("next"),
      zoomIn: document.getElementById("primaryZoomIn"), // modified by ngx-extended-pdf-viewer
      zoomOut: document.getElementById("primaryZoomOut"), // modified by ngx-extended-pdf-viewer
      print: document.getElementById("printButton"),
      editorFreeTextButton: document.getElementById("primaryEditorFreeText"), // modified by ngx-extended-pdf-viewer
      editorFreeTextParamsToolbar: document.getElementById(
        "editorFreeTextParamsToolbar"
      ),
      editorHighlightButton: document.getElementById("primaryEditorHighlight"), // modified by ngx-extended-pdf-viewer
      editorHighlightParamsToolbar: document.getElementById(
        "editorHighlightParamsToolbar"
      ),
      editorHighlightColorPicker: document.getElementById(
        "editorHighlightColorPicker"
      ),
      editorInkButton: document.getElementById("primaryEditorInk"),  // modified by ngx-extended-pdf-viewer
      editorInkParamsToolbar: document.getElementById("editorInkParamsToolbar"),
      editorStampButton: document.getElementById("primaryEditorStamp"),  // modified by ngx-extended-pdf-viewer
      presentationModeButton: document.getElementById("presentationMode"), // #1807 modified by ngx-extended-pdf-viewer
      editorStampParamsToolbar: document.getElementById(
        "editorStampParamsToolbar"
      ),
      download: document.getElementById("downloadButton"),
    },
    secondaryToolbar: {
      toolbar: document.getElementById("secondaryToolbar"),
      toggleButton: document.getElementById("secondaryToolbarToggle"),
      presentationModeButton: document.getElementById("secondaryPresentationMode"), // #1807 modified by ngx-extended-pdf-viewer
      openFileButton:
        typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")
          ? document.getElementById("secondaryOpenFile")
          : null,
      printButton: document.getElementById("secondaryPrint"),
      downloadButton: document.getElementById("secondaryDownload"),
      viewBookmarkButton: document.getElementById("viewBookmark"),
      firstPageButton: document.getElementById("firstPage"),
      lastPageButton: document.getElementById("lastPage"),
      pageRotateCwButton: document.getElementById("pageRotateCw"),
      pageRotateCcwButton: document.getElementById("pageRotateCcw"),
      cursorSelectToolButton: document.getElementById("cursorSelectTool"),
      cursorHandToolButton: document.getElementById("cursorHandTool"),
      scrollPageButton: document.getElementById("scrollPage"),
      scrollVerticalButton: document.getElementById("scrollVertical"),
      scrollHorizontalButton: document.getElementById("scrollHorizontal"),
      scrollWrappedButton: document.getElementById("scrollWrapped"),
      spreadNoneButton: document.getElementById("spreadNone"),
      spreadOddButton: document.getElementById("spreadOdd"),
      spreadEvenButton: document.getElementById("spreadEven"),
      imageAltTextSettingsButton: document.getElementById(
        "imageAltTextSettings"
      ),
      imageAltTextSettingsSeparator: document.getElementById(
        "imageAltTextSettingsSeparator"
      ),
      documentPropertiesButton: document.getElementById("documentProperties"),
    },
    sidebar: {
      // Divs (and sidebar button)
      outerContainer: document.getElementById("outerContainer"),
      sidebarContainer: document.getElementById("sidebarContainer"),
      toggleButton: document.getElementById("primarySidebarToggle"), // modified by ngx-extended-pdf-viewer
      resizer: document.getElementById("sidebarResizer"),
      // Buttons
      thumbnailButton: document.getElementById("viewThumbnail"),
      outlineButton: document.getElementById("viewOutline"),
      attachmentsButton: document.getElementById("viewAttachments"),
      layersButton: document.getElementById("viewLayers"),
      // Views
      thumbnailView: document.getElementById("thumbnailView"),
      outlineView: document.getElementById("outlineView"),
      attachmentsView: document.getElementById("attachmentsView"),
      layersView: document.getElementById("layersView"),
      // View-specific options
      currentOutlineItemButton: document.getElementById("currentOutlineItem"),
    },
    findBar: {
      bar: document.getElementById("findbar"),
      toggleButton: document.getElementById("primaryViewFind"), // modified by ngx-extended-pdf-viewer
      findField: document.getElementById("findInput"),
      highlightAllCheckbox: document.getElementById("findHighlightAll"),
      caseSensitiveCheckbox: document.getElementById("findMatchCase"),
      findMultipleCheckbox: document.getElementById("findMultiple"),
      matchRegExpCheckbox: document.getElementById("matchRegExp"),
      matchDiacriticsCheckbox: document.getElementById("findMatchDiacritics"),
      entireWordCheckbox: document.getElementById("findEntireWord"),
      findMsg: document.getElementById("findMsg"),
      findResultsCount: document.getElementById("findResultsCount"),
      findPreviousButton: document.getElementById("findPreviousButton") ?? document.getElementById("findPrevious"),
      findNextButton: document.getElementById("findNextButton") ?? document.getElementById("findNext"),
    },
    passwordOverlay: {
      dialog: document.getElementById("passwordDialog"),
      label: document.getElementById("passwordText"),
      input: document.getElementById("password"),
      submitButton: document.getElementById("passwordSubmit"),
      cancelButton: document.getElementById("passwordCancel"),
    },
    documentProperties: {
      dialog: document.getElementById("documentPropertiesDialog"),
      closeButton: document.getElementById("documentPropertiesClose"),
      fields: {
        fileName: document.getElementById("fileNameField"),
        fileSize: document.getElementById("fileSizeField"),
        title: document.getElementById("titleField"),
        author: document.getElementById("authorField"),
        subject: document.getElementById("subjectField"),
        keywords: document.getElementById("keywordsField"),
        creationDate: document.getElementById("creationDateField"),
        modificationDate: document.getElementById("modificationDateField"),
        creator: document.getElementById("creatorField"),
        producer: document.getElementById("producerField"),
        version: document.getElementById("versionField"),
        pageCount: document.getElementById("pageCountField"),
        pageSize: document.getElementById("pageSizeField"),
        linearized: document.getElementById("linearizedField"),
      },
    },
    altTextDialog: {
      dialog: document.getElementById("altTextDialog"),
      optionDescription: document.getElementById("descriptionButton"),
      optionDecorative: document.getElementById("decorativeButton"),
      textarea: document.getElementById("descriptionTextarea"),
      cancelButton: document.getElementById("altTextCancel"),
      saveButton: document.getElementById("altTextSave"),
    },
    newAltTextDialog: {
      dialog: document.getElementById("newAltTextDialog"),
      title: document.getElementById("newAltTextTitle"),
      descriptionContainer: document.getElementById(
        "newAltTextDescriptionContainer"
      ),
      textarea: document.getElementById("newAltTextDescriptionTextarea"),
      disclaimer: document.getElementById("newAltTextDisclaimer"),
      learnMore: document.getElementById("newAltTextLearnMore"),
      imagePreview: document.getElementById("newAltTextImagePreview"),
      createAutomatically: document.getElementById(
        "newAltTextCreateAutomatically"
      ),
      createAutomaticallyButton: document.getElementById(
        "newAltTextCreateAutomaticallyButton"
      ),
      downloadModel: document.getElementById("newAltTextDownloadModel"),
      downloadModelDescription: document.getElementById(
        "newAltTextDownloadModelDescription"
      ),
      error: document.getElementById("newAltTextError"),
      errorCloseButton: document.getElementById("newAltTextCloseButton"),
      cancelButton: document.getElementById("newAltTextCancel"),
      notNowButton: document.getElementById("newAltTextNotNow"),
      saveButton: document.getElementById("newAltTextSave"),
    },
    altTextSettingsDialog: {
      dialog: document.getElementById("altTextSettingsDialog"),
      createModelButton: document.getElementById("createModelButton"),
      aiModelSettings: document.getElementById("aiModelSettings"),
      learnMore: document.getElementById("altTextSettingsLearnMore"),
      deleteModelButton: document.getElementById("deleteModelButton"),
      downloadModelButton: document.getElementById("downloadModelButton"),
      showAltTextDialogButton: document.getElementById(
        "showAltTextDialogButton"
      ),
      altTextSettingsCloseButton: document.getElementById(
        "altTextSettingsCloseButton"
      ),
      closeButton: document.getElementById("altTextSettingsCloseButton"),
    },
    annotationEditorParams: {
      editorFreeTextFontSize: document.getElementById("editorFreeTextFontSize"),
      editorFreeTextColor: document.getElementById("editorFreeTextColor"),
      editorInkColor: document.getElementById("editorInkColor"),
      editorInkThickness: document.getElementById("editorInkThickness"),
      editorInkOpacity: document.getElementById("editorInkOpacity"),
      editorStampAddImage: document.getElementById("editorStampAddImage"),
      editorFreeHighlightThickness: document.getElementById(
        "editorFreeHighlightThickness"
      ),
      editorHighlightShowAll: document.getElementById("editorHighlightShowAll"),
    },
    printContainer: document.getElementById("printContainer"),
  };
}

function webViewerLoad() {
  const config = getViewerConfiguration();

  if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("GENERIC")) {
    // Give custom implementations of the default viewer a simpler way to
    // set various `AppOptions`, by dispatching an event once all viewer
    // files are loaded but *before* the viewer initialization has run.
    const event = new CustomEvent("webviewerloaded", {
      bubbles: true,
      cancelable: true,
      detail: {
        source: window,
      },
    });
    try {
      // Attempt to dispatch the event at the embedding `document`,
      // in order to support cases where the viewer is embedded in
      // a *dynamically* created <iframe> element.
      // #2070 modified by ngx-extended-pdf-viewer:
      // send the event to the document by default instead to the parent
      document.dispatchEvent(event);
    } catch (ex) {
      // The viewer could be in e.g. a cross-origin <iframe> element,
      // fallback to dispatching the event at the current `document`.
      console.error(`webviewerloaded: ${ex}`);
      parent.document.dispatchEvent(event);
      // #2070 end of modification
    }
  }
  PDFViewerApplication.run(config);
}

// Block the "load" event until all pages are loaded, to ensure that printing
// works in Firefox; see https://bugzilla.mozilla.org/show_bug.cgi?id=1618553
document.blockUnblockOnload?.(true);

//  modified by ngx-extended-pdf-viewer
if (globalThis.STANDALONE_VIEWER) {
  if (
    document.readyState === "interactive" ||
    document.readyState === "complete"
  ) {
    webViewerLoad();
  } else {
    document.addEventListener("DOMContentLoaded", webViewerLoad, true);
  }
}
// end of modification by ngx-extended-pdf-viewer

export { PDFViewerApplication, AppConstants as PDFViewerApplicationConstants, AppOptions as PDFViewerApplicationOptions, webViewerLoad };
