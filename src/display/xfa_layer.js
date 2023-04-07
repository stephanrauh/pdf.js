/* Copyright 2021 Mozilla Foundation
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

/** @typedef {import("./display_utils").PageViewport} PageViewport */
/** @typedef {import("../../web/interfaces").IPDFLinkService} IPDFLinkService */

import { XfaText } from "./xfa_text.js";

/**
 * @typedef {Object} XfaLayerParameters
 * @property {PageViewport} viewport
 * @property {HTMLDivElement} div
 * @property {Object} xfaHtml
 * @property {AnnotationStorage} [annotationStorage]
 * @property {IPDFLinkService} linkService
 * @property {string} [intent] - (default value is 'display').
 */

class XfaLayer {
  static setupStorage(html, id, element, storage, intent) {
    // #1585 modified by ngx-extended-pdf-viewer
    let fieldname = "";
    let ancestor = html;
    let parent = undefined;
    while (ancestor) {
      if (ancestor.getAttribute("xfaname")) {
        fieldname += ancestor.getAttribute("xfaname") + ":" + fieldname;
        if (!parent) {
          parent = ancestor;
        }
      }
      ancestor = ancestor.parentElement;
    }
    if (fieldname === "") {
      console.log(
        "Unexpected layout of the XFA document - there must be at least one xfaname attribute, otherwise ngx-extended-pdf-viewer won't work"
      );
    } else {
      // remove the trailing colon
      fieldname = fieldname.substring(0, fieldname.length - 1);
    }

    let radioFieldValue;
    if (element.attributes.type === "radio") {
      // radio buttons are rendered a bit differently
      // What we believed to be the field name is the value of the
      // radio button if checked; the field name itself is a few
      // steps higher up the DOM tree
      radioFieldValue = fieldname;
      ancestor = parent.parentElement;
      while (parent) {
        if (parent.getAttribute("xfaname")) {
          fieldname = ancestor.getAttribute("xfaname");
          break;
        }
        parent = parent.parentElement;
      }
      console.log(id + " " + fieldname + " " + radioFieldValue + " " + html);
    }
    // #1585 end of modification by ngx-extended-pdf-viewer
    const storedData = storage.getValue(id, fieldname, { value: null });
    // end of modification by ngx-extended-pdf-viewer
    switch (element.name) {
      case "textarea":
        if (storedData.value !== null) {
          html.textContent = storedData.value;
        }
        if (intent === "print") {
          break;
        }
        html.addEventListener("input", event => {
          storage.setValue(id, fieldname, { value: event.target.value }); // #1585 end of modification by ngx-extended-pdf-viewer
        });
        break;
      case "input":
        if (element.attributes.type === "radio" || element.attributes.type === "checkbox") {
          if (storedData.value === element.attributes.xfaOn) {
            html.setAttribute("checked", true);
          } else if (storedData.value === element.attributes.xfaOff) {
            // The checked attribute may have been set when opening the file,
            // unset through the UI and we're here because of printing.
            html.removeAttribute("checked");
          }
          if (intent === "print") {
            break;
          }
          html.addEventListener("change", event => {
            if (element.attributes.type === "radio") {
              if (event.target.checked) {
                storage.setValue(id, fieldname, { // #1585 end of modification by ngx-extended-pdf-viewer
                  value: event.target.checked ? event.target.getAttribute("xfaOn") : event.target.getAttribute("xfaOff"),
                  radioValue: radioFieldValue,
                });
              } else {
                storage.setValue(id, fieldname, { // #1585 end of modification by ngx-extended-pdf-viewer
                  value: event.target.checked ? event.target.getAttribute("xfaOn") : event.target.getAttribute("xfaOff"),
                  emitMessage: false,
                });
              }
            } else {
              storage.setValue(id, fieldname, { // #1585 end of modification by ngx-extended-pdf-viewer
                value: event.target.checked ? event.target.getAttribute("xfaOn") : event.target.getAttribute("xfaOff"),
              });
            }
          });
        } else {
          if (storedData.value !== null) {
            html.setAttribute("value", storedData.value);
          }
          if (intent === "print") {
            break;
          }
          html.addEventListener("input", event => {
            storage.setValue(id, fieldname, { value: event.target.value }); // #1585 end of modification by ngx-extended-pdf-viewer
          });
        }
        break;
      case "select":
        if (storedData.value !== null) {
          for (const option of element.children) {
            if (option.attributes.value === storedData.value) {
              option.attributes.selected = true;
            }
          }
        }
        html.addEventListener("input", event => {
          const options = event.target.options;
          const value =
            options.selectedIndex === -1
              ? ""
              : options[options.selectedIndex].value;
          storage.setValue(id, fieldname, { value }); // #1585 end of modification by ngx-extended-pdf-viewer
        });
        break;
    }
  }

  static setAttributes({ html, element, storage = null, intent, linkService }) {
    const { attributes } = element;
    const isHTMLAnchorElement = html instanceof HTMLAnchorElement;

    if (attributes.type === "radio") {
      // Avoid to have a radio group when printing with the same as one
      // already displayed.
      attributes.name = `${attributes.name}-${intent}`;
    }
    for (const [key, value] of Object.entries(attributes)) {
      if (value === null || value === undefined) {
        continue;
      }

      switch (key) {
        case "class":
          if (value.length) {
            html.setAttribute(key, value.join(" "));
          }
          break;
        case "dataId":
          // We don't need to add dataId in the html object but it can
          // be useful to know its value when writing printing tests:
          // in this case, don't skip dataId to have its value.
          // #1718 modified by ngx-extended-pdf-viewer
          // because it needs the dataId in the HTML code
          // to be able to assign the field correctly
          html.setAttribute(key, value);
          // #1718 end of modification by ngx-extended-pdf-viewer
          break;
        case "id":
          html.setAttribute("data-element-id", value);
          break;
        case "style":
          Object.assign(html.style, value);
          break;
        case "textContent":
          html.textContent = value;
          break;
        default:
          if (!isHTMLAnchorElement || (key !== "href" && key !== "newWindow")) {
            html.setAttribute(key, value);
          }
      }
    }

    if (isHTMLAnchorElement) {
      linkService.addLinkAttributes(
        html,
        attributes.href,
        attributes.newWindow
      );
    }

    // Set the value after the others to be sure to overwrite any other values.
    if (storage && attributes.dataId) {
      this.setupStorage(html, attributes.dataId, element, storage);
    }
  }

  /**
   * Render the XFA layer.
   *
   * @param {XfaLayerParameters} parameters
   */
  static render(parameters) {
    const storage = parameters.annotationStorage;
    const linkService = parameters.linkService;
    const root = parameters.xfaHtml;
    const intent = parameters.intent || "display";
    const rootHtml = document.createElement(root.name);
    if (root.attributes) {
      this.setAttributes({
        html: rootHtml,
        element: root,
        intent,
        linkService,
      });
    }
    const stack = [[root, -1, rootHtml]];

    const rootDiv = parameters.div;
    rootDiv.append(rootHtml);

    if (parameters.viewport) {
      const transform = `matrix(${parameters.viewport.transform.join(",")})`;
      rootDiv.style.transform = transform;
    }

    // Set defaults.
    if (intent !== "richText") {
      rootDiv.setAttribute("class", "xfaLayer xfaFont");
    }

    // Text nodes used for the text highlighter.
    const textDivs = [];

    while (stack.length > 0) {
      const [parent, i, html] = stack.at(-1);
      if (i + 1 === parent.children.length) {
        stack.pop();
        continue;
      }

      const child = parent.children[++stack.at(-1)[1]];
      if (child === null) {
        continue;
      }

      const { name } = child;
      if (name === "#text") {
        const node = document.createTextNode(child.value);
        textDivs.push(node);
        html.append(node);
        continue;
      }

      let childHtml;
      if (child?.attributes?.xmlns) {
        childHtml = document.createElementNS(child.attributes.xmlns, name);
      } else {
        childHtml = document.createElement(name);
      }

      html.append(childHtml);
      if (child.attributes) {
        this.setAttributes({
          html: childHtml,
          element: child,
          storage,
          intent,
          linkService,
        });
      }

      if (child.children && child.children.length > 0) {
        stack.push([child, -1, childHtml]);
      } else if (child.value) {
        const node = document.createTextNode(child.value);
        if (XfaText.shouldBuildText(name)) {
          textDivs.push(node);
        }
        childHtml.append(node);
      }
    }

    /**
     * TODO: re-enable that stuff once we've JS implementation.
     * See https://bugzilla.mozilla.org/show_bug.cgi?id=1719465.
     *
     * for (const el of rootDiv.querySelectorAll(
     * ".xfaDisabled input, .xfaDisabled textarea"
     * )) {
     * el.setAttribute("disabled", true);
     * }
     * for (const el of rootDiv.querySelectorAll(
     * ".xfaReadOnly input, .xfaReadOnly textarea"
     * )) {
     * el.setAttribute("readOnly", true);
     * }
     */

    for (const el of rootDiv.querySelectorAll(
      ".xfaNonInteractive input, .xfaNonInteractive textarea"
    )) {
      el.setAttribute("readOnly", true);
    }

    return {
      textDivs,
    };
  }

  /**
   * Update the XFA layer.
   *
   * @param {XfaLayerParameters} parameters
   */
  static update(parameters) {
    const transform = `matrix(${parameters.viewport.transform.join(",")})`;
    parameters.div.style.transform = transform;
    parameters.div.hidden = false;
  }
}

export { XfaLayer };
