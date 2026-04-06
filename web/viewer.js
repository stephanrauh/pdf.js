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

import '../src/pdf.js'; // #2536 modified by ngx-extended-pdf-viewer (support for Safari 16 + 17)
import { ScrollMode, SpreadMode } from "./ui_utils.js";
import { AppOptions } from "./app_options.js";
import { NgxConsole } from "../external/ngx-logger/ngx-console.js";
import { LinkTarget } from "./pdf_link_service.js";
import { PDFViewerApplication } from "./app.js";
import { RenderingStates } from "./renderable_view.js";

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
    // modified by ngx-extended-pdf-viewer
    // ngx-extended-pdf-viewer puts the viewer in a div bearing the "body" class
    // if you're running the viewer with "gulp server", the default (document.body) kicks in
    appContainer: document.getElementsByClassName("body")[0] ?? document.body,
    // end of modification by ngx-extended-pdf-viewer
    principalContainer: document.getElementById("mainContainer"),
    mainContainer: document.getElementById("viewerContainer"),
    viewerContainer: document.getElementById("viewer"),
    viewerAlert: document.getElementById("viewer-alert"),
    toolbar: {
      container: document.getElementById("toolbarContainer"),
      numPages: document.getElementById("numPages"),
      pageNumber: document.getElementById("pageNumber"),
      scaleSelect: document.getElementById("scaleSelect"),
      customScaleOption: document.getElementById("customScaleOption"),
      previous: document.getElementById("previous"),
      next: document.getElementById("next"),
      zoomIn: document.getElementById("primaryZoomIn") ?? document.getElementById("zoomInButton"), // modified by ngx-extended-pdf-viewer
      zoomOut: document.getElementById("primaryZoomOut") ?? document.getElementById("zoomOutButton"), // modified by ngx-extended-pdf-viewer
      print: document.getElementById("printButton"),
      editorCommentButton: document.getElementById("editorCommentButton"),
      editorCommentParamsToolbar: document.getElementById(
        "editorCommentParamsToolbar"
      ),
      editorFreeTextButton: document.getElementById("primaryEditorFreeText") ?? document.getElementById("editorFreeTextButton"), // modified by ngx-extended-pdf-viewer
      editorFreeTextParamsToolbar: document.getElementById(
        "editorFreeTextParamsToolbar"
      ),
      editorHighlightButton: document.getElementById("primaryEditorHighlight") ?? document.getElementById("editorHighlightButton"), // modified by ngx-extended-pdf-viewer
      editorHighlightParamsToolbar: document.getElementById(
        "editorHighlightParamsToolbar"
      ),
      editorHighlightColorPicker: document.getElementById(
        "editorHighlightColorPicker"
      ),
      editorInkButton: document.getElementById("primaryEditorInk") ?? document.getElementById("editorInkButton"),  // modified by ngx-extended-pdf-viewer
      editorInkParamsToolbar: document.getElementById("editorInkParamsToolbar"),
      editorStampButton: document.getElementById("primaryEditorStamp") ?? document.getElementById("editorStampButton"),  // modified by ngx-extended-pdf-viewer
      presentationModeButton: document.getElementById("presentationMode"), // #1807 modified by ngx-extended-pdf-viewer
      editorStampParamsToolbar: document.getElementById(
        "editorStampParamsToolbar"
      ),
      editorSignatureButton: document.getElementById("primaryEditorSignatureButton") ?? document.getElementById("editorSignatureButton"),
      editorSignatureParamsToolbar: document.getElementById(
        "editorSignatureParamsToolbar"
      ),
      download: document.getElementById("downloadButton"),
      // #2943 modified by ngx-extended-pdf-viewer
      movePageUp: document.getElementById("movePageUpButton"),
      movePageDown: document.getElementById("movePageDownButton"),
      // #2943 end of modification by ngx-extended-pdf-viewer
    },
    secondaryToolbar: {
      toolbar: document.getElementById("secondaryToolbar"),
      toggleButton: document.getElementById("secondaryToolbarToggle"),
      presentationModeButton: document.getElementById("secondaryPresentationMode"), // #1807 modified by ngx-extended-pdf-viewer
      openFileButton:
        typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")
          ? document.getElementById("secondaryOpenFile")
          : null,
      printButton: document.getElementById("secondaryPrintButton"),
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
    viewsManager: {
      outerContainer: document.getElementById("outerContainer"),
      // #modified by ngx-extended-pdf-viewer - PDF.js renamed sidebar → viewsManager in v5.4.530
      // ngx-extended-pdf-viewer still uses old element IDs, so we provide fallbacks for backward compatibility
      toggleButton: document.getElementById("viewsManagerToggleButton") ?? document.getElementById("primarySidebarToggle") ?? document.getElementById("sidebarToggleButton"),
      sidebarContainer: document.getElementById("viewsManager") ?? document.getElementById("sidebarContainer"),
      resizer: document.getElementById("viewsManagerResizer") ?? document.getElementById("sidebarResizer"),
      thumbnailButton: document.getElementById("thumbnailsViewMenu") ?? document.getElementById("viewThumbnail"),
      outlineButton: document.getElementById("outlinesViewMenu") ?? document.getElementById("viewOutline"),
      attachmentsButton: document.getElementById("attachmentsViewMenu") ?? document.getElementById("viewAttachments"),
      layersButton: document.getElementById("layersViewMenu") ?? document.getElementById("viewLayers"),
      // #end of modification by ngx-extended-pdf-viewer
      viewsManagerSelectorButton: document.getElementById(
        "viewsManagerSelectorButton"
      ),
      viewsManagerSelectorOptions: document.getElementById(
        "viewsManagerSelectorOptions"
      ),
      // #modified by ngx-extended-pdf-viewer - fallback to old view container IDs for backward compatibility
      thumbnailsView: document.getElementById("thumbnailsView") ?? document.getElementById("thumbnailView"),
      outlinesView: document.getElementById("outlinesView") ?? document.getElementById("outlineView"),
      // #end of modification by ngx-extended-pdf-viewer
      attachmentsView: document.getElementById("attachmentsView"),
      layersView: document.getElementById("layersView"),
      viewsManagerAddFileButton: document.getElementById(
        "viewsManagerAddFileButton"
      ),
      // #modified by ngx-extended-pdf-viewer - fallback to old currentOutlineItem ID for backward compatibility
      viewsManagerCurrentOutlineButton: document.getElementById(
        "viewsManagerCurrentOutlineButton"
      ) ?? document.getElementById("currentOutlineItem"),
      // #end of modification by ngx-extended-pdf-viewer
      viewsManagerHeaderLabel: document.getElementById(
        "viewsManagerHeaderLabel"
      ),
      viewsManagerStatus: document.getElementById("viewsManagerStatus"),
      manageMenu: {
        button: document.getElementById("viewsManagerStatusActionButton"),
        menu: document.getElementById("viewsManagerStatusActionOptions"),
        copy: document.getElementById("viewsManagerStatusActionCopy"),
        cut: document.getElementById("viewsManagerStatusActionCut"),
        delete: document.getElementById("viewsManagerStatusActionDelete"),
        saveAs: document.getElementById("viewsManagerStatusActionSaveAs"),
      },
    },
    findBar: {
      bar: document.getElementById("findbar"),
      toggleButton: document.getElementById("primaryViewFind") ?? document.getElementById("viewFindButton"), // modified by ngx-extended-pdf-viewer
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
      learnMore: document.getElementById("altTextSettingsLearnMore"),
      showAltTextDialogButton: document.getElementById(
        "showAltTextDialogButton"
      ),
      altTextSettingsCloseButton: document.getElementById(
        "altTextSettingsCloseButton"
      ),
      closeButton: document.getElementById("altTextSettingsCloseButton"),
    },
    addSignatureDialog: {
      dialog: document.getElementById("addSignatureDialog"),
      panels: document.getElementById("addSignatureActionContainer"),
      typeButton: document.getElementById("addSignatureTypeButton"),
      typeInput: document.getElementById("addSignatureTypeInput"),
      drawButton: document.getElementById("addSignatureDrawButton"),
      drawSVG: document.getElementById("addSignatureDraw"),
      drawPlaceholder: document.getElementById("addSignatureDrawPlaceholder"),
      drawThickness: document.getElementById("addSignatureDrawThickness"),
      imageButton: document.getElementById("addSignatureImageButton"),
      imageSVG: document.getElementById("addSignatureImage"),
      imagePlaceholder: document.getElementById("addSignatureImagePlaceholder"),
      imagePicker: document.getElementById("addSignatureFilePicker"),
      imagePickerLink: document.getElementById("addSignatureImageBrowse"),
      description: document.getElementById("addSignatureDescription"),
      clearButton: document.getElementById("clearSignatureButton"),
      saveContainer: document.getElementById("addSignatureSaveContainer"),
      saveCheckbox: document.getElementById("addSignatureSaveCheckbox"),
      errorBar: document.getElementById("addSignatureError"),
      errorTitle: document.getElementById("addSignatureErrorTitle"),
      errorDescription: document.getElementById("addSignatureErrorDescription"),
      errorCloseButton: document.getElementById("addSignatureErrorCloseButton"),
      cancelButton: document.getElementById("addSignatureCancelButton"),
      addButton: document.getElementById("addSignatureAddButton"),
    },
    editSignatureDialog: {
      dialog: document.getElementById("editSignatureDescriptionDialog"),
      description: document.getElementById("editSignatureDescription"),
      editSignatureView: document.getElementById("editSignatureView"),
      cancelButton: document.getElementById("editSignatureCancelButton"),
      updateButton: document.getElementById("editSignatureUpdateButton"),
    },
    annotationEditorParams: {
      editorCommentsSidebar: document.getElementById("editorCommentsSidebar"),
      editorCommentsSidebarCount: document.getElementById(
        "editorCommentsSidebarCount"
      ),
      editorCommentsSidebarTitle: document.getElementById(
        "editorCommentsSidebarTitle"
      ),
      editorCommentsSidebarCloseButton: document.getElementById(
        "editorCommentsSidebarCloseButton"
      ),
      editorCommentsSidebarList: document.getElementById(
        "editorCommentsSidebarList"
      ),
      editorCommentsSidebarResizer: document.getElementById(
        "editorCommentsSidebarResizer"
      ),
      editorFreeTextFontSize: document.getElementById("editorFreeTextFontSize"),
      editorFreeTextColor: document.getElementById("editorFreeTextColor"),
      editorInkColor: document.getElementById("editorInkColor"),
      editorInkThickness: document.getElementById("editorInkThickness"),
      editorInkOpacity: document.getElementById("editorInkOpacity"),
      editorStampAddImage: document.getElementById("editorStampAddImage"),
      editorSignatureAddSignature: document.getElementById(
        "editorSignatureAddSignature"
      ),
      editorFreeHighlightThickness: document.getElementById(
        "editorFreeHighlightThickness"
      ),
      editorHighlightShowAll: document.getElementById("editorHighlightShowAll"),
    },
    // printContainer: document.getElementById("printContainer"), // #2603 modified by ngx-extended-pdf-viewer
    editorUndoBar: {
      container: document.getElementById("editorUndoBar"),
      message: document.getElementById("editorUndoBarMessage"),
      undoButton: document.getElementById("editorUndoBarUndoButton"),
      closeButton: document.getElementById("editorUndoBarCloseButton"),
    },
    editCommentDialog: {
      dialog: document.getElementById("commentManagerDialog"),
      toolbar: document.getElementById("commentManagerToolbar"),
      title: document.getElementById("commentManagerTitle"),
      textInput: document.getElementById("commentManagerTextInput"),
      cancelButton: document.getElementById("commentManagerCancelButton"),
      saveButton: document.getElementById("commentManagerSaveButton"),
    },
  };
}

function webViewerLoad(cspPolicyService) { // #2362 modified by ngx-extended-pdf-viewer
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
    // #2070 + #2898 modified by ngx-extended-pdf-viewer:
    // pdf.js tries to send the event to the parent of the document
    // to cover scenarios where the PDF file is created in an iFrame,
    // but the outer document has an event listener.
    // ngx-extended-pdf-viewer controls the event itself,
    // so we don't need that. We can (and must) ignore that scenario.
    document.dispatchEvent(event);
    // #2070 #2898 end of modification by ngx-extended-pdf-viewer
  }
  config.cspPolicyService = cspPolicyService; // #2362 modified by ngx-extended-pdf-viewer
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

// #2687 modified by ngx-extended-pdf-viewer - unified pdf.js and viewer.js into a single file
const event = new CustomEvent("ngxViewerFileHasBeenLoaded", {
  detail: {
    PDFViewerApplication,
    PDFViewerApplicationConstants: AppConstants,
    PDFViewerApplicationOptions: AppOptions,
    webViewerLoad,
  },
});
document.dispatchEvent(event);
// end of modification by ngx-extended-pdf-viewer

export {
  PDFViewerApplication,
  AppConstants as PDFViewerApplicationConstants,
  AppOptions as PDFViewerApplicationOptions,
  webViewerLoad
};
