/* Copyright 2023 Mozilla Foundation
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

/** @typedef {import("./interfaces").IL10n} IL10n */

/**
 * NOTE: The L10n-implementations should use lowercase language-codes
 *       internally.
 * @implements {IL10n}
 */
class L10n {
  __dir;

  __elements = new Set();

  __lang;

  __l10n;

  constructor({ lang, isRTL }, l10n = null) {
    this.__lang = L10n.__fixupLangCode(lang);
    this.__l10n = l10n;
    this.__dir = isRTL ?? L10n.__isRTL(this.__lang) ? "rtl" : "ltr";
  }

  _setL10n(l10n) {
    this.__l10n = l10n;
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      document.l10n = l10n;
    }
  }

  /** @inheritdoc */
  getLanguage() {
    return this.__lang;
  }

  /** @inheritdoc */
  getDirection() {
    return this.__dir;
  }

  /** @inheritdoc */
  async get(ids, args = null, fallback) {
    if (Array.isArray(ids)) {
      ids = ids.map(id => ({ id }));
      const messages = await this.__l10n.formatMessages(ids);
      return messages.map(message => message.value);
    }

    const messages = await this.__l10n.formatMessages([
      {
        id: ids,
        args,
      },
    ]);
    return messages?.[0].value || fallback;
  }

  /** @inheritdoc */
  async translate(element) {
    this.__elements.add(element);
    try {
      this.__l10n.connectRoot(element);
      await this.__l10n.translateRoots();
    } catch {
      // Element is under an existing root, so there is no need to add it again.
    }
  }

  /** @inheritdoc */
  async destroy() {
    for (const element of this.__elements) {
      this.__l10n.disconnectRoot(element);
    }
    this.__elements.clear();
    this.__l10n.pauseObserving();
  }

  /** @inheritdoc */
  pause() {
    this.__l10n.pauseObserving();
  }

  /** @inheritdoc */
  resume() {
    this.__l10n.resumeObserving();
  }

  static __fixupLangCode(langCode) {
    // Use only lowercase language-codes internally, and fallback to English.
    langCode = langCode?.toLowerCase() || "en-us";

    // Try to support "incompletely" specified language codes (see issue 13689).
    const PARTIAL_LANG_CODES = {
      en: "en-us",
      es: "es-es",
      fy: "fy-nl",
      ga: "ga-ie",
      gu: "gu-in",
      hi: "hi-in",
      hy: "hy-am",
      nb: "nb-no",
      ne: "ne-np",
      nn: "nn-no",
      pa: "pa-in",
      pt: "pt-pt",
      sv: "sv-se",
      zh: "zh-cn",
    };
    return PARTIAL_LANG_CODES[langCode] || langCode;
  }

  static __isRTL(lang) {
    const shortCode = lang.split("-", 1)[0];
    return ["ar", "he", "fa", "ps", "ur"].includes(shortCode);
  }
}

const GenericL10n = null;

export { GenericL10n, L10n };
