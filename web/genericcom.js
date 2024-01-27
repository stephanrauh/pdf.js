/* Copyright 2017 Mozilla Foundation
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

import { AppOptions } from "./app_options.js";
import { BaseExternalServices } from "./external_services.js";
import { BasePreferences } from "./preferences.js";
import { GenericL10n } from "./genericl10n.js";
import { GenericScripting } from "./generic_scripting.js";

if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("GENERIC")) {
  throw new Error(
    'Module "pdfjs-web/genericcom" shall not be used outside GENERIC build.'
  );
}

const GenericCom = {};

class Preferences extends BasePreferences {
  async _writeToStorage(prefObj) {
    // #1313 modified by ngx-extended-pdf-viewer
    try {
      localStorage.setItem("pdfjs.preferences", JSON.stringify(prefObj));
    } catch (safariSecurityException) {
      // localStorage is not available on Safari
    }
    // #1313 end of modification by ngx-extended-pdf-viewer
  }

  async _readFromStorage(prefObj) {
    // #1313 modified by ngx-extended-pdf-viewer
    try {
      return { prefs: JSON.parse(localStorage.getItem("pdfjs.preferences")) };
    } catch (safariSecurityException) {
      // localStorage is not available on Safari
      return {};
    }
    // #1313 end of modification by ngx-extended-pdf-viewer
  }
}

class ExternalServices extends BaseExternalServices {
  async createL10n() {
    return new GenericL10n(AppOptions.get("locale"));
  }

  createScripting() {
    return new GenericScripting(AppOptions.get("sandboxBundleSrc"));
  }
}

export { ExternalServices, GenericCom, Preferences };
