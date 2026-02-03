// ==UserScript==
// @name         Text Explainer X
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Explain selected text using LLM with follow-up chat, web search, and Anki integration
// @author       RoCry (original), Jake (contributor)
// @icon         data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwcHgiIGhlaWdodD0iODAwcHgiIHZpZXdCb3g9IjAgMCAxOTIgMTkyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiPjxjaXJjbGUgY3g9IjExNiIgY3k9Ijc2IiByPSI1NCIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjEyIi8+PHBhdGggc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMTIiIGQ9Ik04Ni41IDEyMS41IDQxIDE2N2MtNC40MTggNC40MTgtMTEuNTgyIDQuNDE4LTE2IDB2MGMtNC40MTgtNC40MTgtNC40MTgtMTEuNTgyIDAtMTZsNDQuNS00NC41TTkyIDYybDEyIDMyIDEyLTMyIDEyIDMyIDEyLTMyIi8+PC9zdmc+
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      openrouter.ai
// @connect      api.openai.com
// @connect      api.anthropic.com
// @connect      generativelanguage.googleapis.com
// @connect      kagi.com
// @connect      api.search.brave.com
// @connect      api.tavily.com
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/marked@15.0.6/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js
// @run-at       document-end
// @inject-into  content
// @license      MIT
// @homepageURL  https://greasyfork.org/en/scripts/565006-text-explainer-x
// @supportURL   https://github.com/happyjake/text-explainer-x/issues
// @downloadURL  https://update.greasyfork.org/scripts/565006/Text%20Explainer%20X.user.js
// @updateURL    https://update.greasyfork.org/scripts/565006/Text%20Explainer%20X.meta.js
// ==/UserScript==

/**
 * Text Explainer X - Explain selected text using LLM
 * Enhanced version with follow-up chat, web search, and Anki integration
 *
 * Based on: https://greasyfork.org/en/scripts/528810-text-explainer
 * Original Author: RoCry
 * Contributors: Jake
 *
 * Licensed under the MIT License
 * https://opensource.org/licenses/MIT
 */

(function () {
  "use strict";

  // ============== Inlined: GetSelectionContext ==============
  function GetSelectionContext(tryContextLength = 500) {
    const MAX_CONTEXT_LENGTH = 8192;
    const actualContextLength = Math.min(tryContextLength, MAX_CONTEXT_LENGTH);
    const halfContextLength = Math.floor(actualContextLength / 2);

    const selection = window.getSelection();
    if (
      !selection ||
      selection.rangeCount === 0 ||
      selection.toString().trim() === ""
    ) {
      return {
        selectedText: null,
        textBefore: null,
        textAfter: null,
        paragraphText: null,
      };
    }

    const selectedText = selection.toString().trim();
    const range = selection.getRangeAt(0);

    function getTextNodesIn(node) {
      const textNodes = [];
      const walk = document.createTreeWalker(
        node,
        NodeFilter.SHOW_TEXT,
        null,
        false,
      );
      let currentNode;
      while ((currentNode = walk.nextNode())) {
        textNodes.push(currentNode);
      }
      return textNodes;
    }

    const allTextNodes = getTextNodesIn(document.body);
    const startNode = range.startContainer;
    const endNode = range.endContainer;

    let textBefore = "";
    let textAfter = "";
    let beforeIndex = allTextNodes.findIndex((node) => node === startNode) - 1;
    let currentLength = 0;

    if (startNode.nodeType === Node.TEXT_NODE) {
      textBefore =
        startNode.textContent.substring(0, range.startOffset) + textBefore;
      currentLength = textBefore.length;
    }

    while (beforeIndex >= 0 && currentLength < halfContextLength) {
      const node = allTextNodes[beforeIndex];
      const nodeText = node.textContent;
      textBefore = nodeText + "\n" + textBefore;
      currentLength += nodeText.length;
      beforeIndex--;
    }

    if (beforeIndex >= 0) {
      textBefore = "...\n" + textBefore;
    }

    let afterIndex = allTextNodes.findIndex((node) => node === endNode) + 1;
    currentLength = 0;

    if (endNode.nodeType === Node.TEXT_NODE) {
      textAfter += endNode.textContent.substring(range.endOffset);
      currentLength = textAfter.length;
    }

    while (
      afterIndex < allTextNodes.length &&
      currentLength < halfContextLength
    ) {
      const node = allTextNodes[afterIndex];
      const nodeText = node.textContent;
      textAfter += nodeText + "\n";
      currentLength += nodeText.length;
      afterIndex++;
    }

    if (afterIndex < allTextNodes.length) {
      textAfter += "\n...";
    }

    textBefore = textBefore.trim();
    textAfter = textAfter.trim();
    const paragraphText = (
      textBefore +
      " " +
      selectedText +
      " " +
      textAfter
    ).trim();

    return { selectedText, textBefore, textAfter, paragraphText };
  }

  // ============== Inlined: Settings Manager ==============
  const STORAGE_KEY = "text-explainer-settings";
  const defaultConfig = {
    model: "openai/gpt-4o-mini",
    apiKey: null,
    baseUrl: "https://openrouter.ai/api",
    provider: "openrouter",
    language: "Chinese",
    searchProvider: "brave",
    kagiApiKey: null,
    braveApiKey: null,
    tavilyApiKey: null,
    ankiApiKey: null,
    ankiEndpoint: "",
    shortcut: {
      key: "d",
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      metaKey: false,
    },
    floatingButton: { enabled: true, size: "medium", position: "bottom-right" },
  };

  function loadSettings() {
    try {
      const stored = GM_getValue(STORAGE_KEY);
      if (stored) {
        return { ...defaultConfig, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
    return { ...defaultConfig };
  }

  function saveSettings(settings) {
    GM_setValue(STORAGE_KEY, JSON.stringify(settings));
  }

  let config = loadSettings();

  function openSettingsDialog(onSave) {
    const existing = document.getElementById("explainer-settings-dialog");
    if (existing) existing.remove();
    const existingOverlay = document.getElementById(
      "explainer-settings-overlay",
    );
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement("div");
    overlay.id = "explainer-settings-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483646;";

    const dialog = document.createElement("div");
    dialog.id = "explainer-settings-dialog";
    dialog.style.cssText =
      "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:16px;border-radius:8px;z-index:2147483647;min-width:300px;max-width:90vw;max-height:85vh;overflow-y:auto;font:12px/1.4 system-ui,sans-serif;color:#333;box-shadow:0 4px 20px rgba(0,0,0,0.25);";

    // Helpers
    const el = (tag, style, text) => {
      const e = document.createElement(tag);
      if (style) e.style.cssText = style;
      if (text) e.textContent = text;
      return e;
    };
    const row = () =>
      el("div", "display:flex;align-items:center;gap:8px;margin-bottom:6px;");
    const label = (text) => el("span", "min-width:55px;color:#666;", text);
    const input = (type, value, placeholder) => {
      const i = document.createElement("input");
      i.type = type;
      i.value = value || "";
      i.placeholder = placeholder || "";
      i.style.cssText =
        "flex:1;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font:inherit;min-width:0;";
      return i;
    };
    const select = (options, selected) => {
      const s = document.createElement("select");
      s.style.cssText =
        "flex:1;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font:inherit;min-width:0;";
      options.forEach(([v, t]) => {
        const o = el("option");
        o.value = v;
        o.textContent = t;
        if (v === selected) o.selected = true;
        s.appendChild(o);
      });
      return s;
    };
    const divider = () => el("div", "border-top:1px solid #eee;margin:10px 0;");

    // Title
    dialog.appendChild(
      el(
        "div",
        "font-size:14px;font-weight:600;margin-bottom:12px;",
        "Text Explainer Settings",
      ),
    );

    // Provider
    let r = row();
    r.appendChild(label("Provider"));
    const providerSel = select(
      [
        ["gemini", "Gemini"],
        ["openai", "OpenAI"],
        ["openrouter", "OpenRouter"],
        ["anthropic", "Anthropic"],
      ],
      config.provider,
    );
    r.appendChild(providerSel);
    dialog.appendChild(r);

    // Model with refresh button and custom dropdown
    r = row();
    r.appendChild(label("Model"));
    const modelWrap = el("div", "flex:1;position:relative;min-width:0;");
    const modelInput = input("text", config.model, "model name");
    modelInput.style.cssText =
      "width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font:inherit;box-sizing:border-box;";
    const modelDropdown = el(
      "div",
      "position:absolute;top:100%;left:0;right:0;max-height:150px;overflow-y:auto;background:#fff;border:1px solid #ccc;border-radius:4px;display:none;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,0.15);",
    );
    let modelOptions = [];
    const showDropdown = (filter = "") => {
      if (!modelOptions.length) return;
      const filtered = filter
        ? modelOptions.filter((m) => m.toLowerCase().includes(filter.toLowerCase()))
        : modelOptions;
      if (!filtered.length) {
        modelDropdown.style.display = "none";
        return;
      }
      modelDropdown.innerHTML = "";
      filtered.forEach((m) => {
        const opt = el("div", "padding:6px 8px;cursor:pointer;font:inherit;", m);
        opt.addEventListener("mouseenter", () => (opt.style.background = "#f0f0f0"));
        opt.addEventListener("mouseleave", () => (opt.style.background = ""));
        opt.addEventListener("mousedown", (e) => {
          e.preventDefault();
          modelInput.value = m;
          modelDropdown.style.display = "none";
        });
        modelDropdown.appendChild(opt);
      });
      modelDropdown.style.display = "block";
    };
    modelInput.addEventListener("focus", () => showDropdown());
    modelInput.addEventListener("input", () => showDropdown(modelInput.value));
    modelInput.addEventListener("blur", () => setTimeout(() => (modelDropdown.style.display = "none"), 150));
    modelWrap.appendChild(modelInput);
    modelWrap.appendChild(modelDropdown);
    r.appendChild(modelWrap);
    const refreshBtn = el(
      "button",
      "padding:4px 8px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;cursor:pointer;font:inherit;flex-shrink:0;",
      "↻",
    );
    refreshBtn.title = "Fetch models from Base URL";
    refreshBtn.type = "button";
    refreshBtn.addEventListener("click", () => {
      const baseUrl = baseInput.value.trim().replace(/\/$/, "");
      if (!baseUrl) return;
      refreshBtn.disabled = true;
      refreshBtn.textContent = "...";
      GM_xmlhttpRequest({
        method: "GET",
        url: `${baseUrl}/v1/models`,
        headers: { Authorization: `Bearer ${apiInput.value}` },
        onload: (res) => {
          refreshBtn.disabled = false;
          refreshBtn.textContent = "↻";
          if (res.status >= 200 && res.status < 300) {
            try {
              const data = JSON.parse(res.responseText);
              const models = (data.data || data.models || []).map((m) =>
                typeof m === "string" ? m : m.id || m.name,
              );
              modelOptions = models;
              showDropdown();
            } catch (e) {
              console.error("Failed to parse models:", e);
            }
          }
        },
        onerror: () => {
          refreshBtn.disabled = false;
          refreshBtn.textContent = "↻";
        },
      });
    });
    r.appendChild(refreshBtn);
    dialog.appendChild(r);

    // Base URL
    r = row();
    r.appendChild(label("Base URL"));
    const baseInput = input("text", config.baseUrl, "https://...");
    r.appendChild(baseInput);
    dialog.appendChild(r);

    // API Key
    r = row();
    r.appendChild(label("API Key"));
    const apiInput = input("password", config.apiKey, "optional");
    r.appendChild(apiInput);
    dialog.appendChild(r);

    // Search Provider
    r = row();
    r.appendChild(label("Search"));
    const searchSel = select(
      [
        ["brave", "Brave"],
        ["kagi", "Kagi"],
        ["tavily", "Tavily"],
      ],
      config.searchProvider,
    );
    searchSel.style.cssText = "width:65px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font:inherit;";
    r.appendChild(searchSel);
    const searchKeys = { kagi: config.kagiApiKey || "", brave: config.braveApiKey || "", tavily: config.tavilyApiKey || "" };
    const searchInput = input("password", searchKeys[config.searchProvider], "API key");
    searchSel.addEventListener("change", () => {
      searchKeys[searchInput.dataset.provider || config.searchProvider] = searchInput.value;
      searchInput.value = searchKeys[searchSel.value] || "";
      searchInput.dataset.provider = searchSel.value;
    });
    searchInput.dataset.provider = config.searchProvider;
    r.appendChild(searchInput);
    dialog.appendChild(r);

    // Anki (URL + Key in one row)
    r = row();
    r.appendChild(label("Anki"));
    const ankiUrlInput = input("text", config.ankiEndpoint, "endpoint URL");
    ankiUrlInput.style.cssText = "flex:1;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font:inherit;min-width:0;";
    r.appendChild(ankiUrlInput);
    const ankiKeyInput = input("password", config.ankiApiKey, "key");
    ankiKeyInput.style.cssText = "width:70px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font:inherit;";
    r.appendChild(ankiKeyInput);
    dialog.appendChild(r);

    // Language
    r = row();
    r.appendChild(label("Language"));
    const langSel = select(
      [
        "Chinese",
        "English",
        "Japanese",
        "Korean",
        "Spanish",
        "French",
        "German",
      ].map((l) => [l, l]),
      config.language,
    );
    r.appendChild(langSel);
    dialog.appendChild(r);

    providerSel.addEventListener("change", () => {
      const urls = {
        gemini: "https://generativelanguage.googleapis.com",
        openai: "https://api.openai.com",
        openrouter: "https://openrouter.ai/api",
        anthropic: "https://api.anthropic.com",
      };
      baseInput.value = urls[providerSel.value] || "";
    });

    dialog.appendChild(divider());

    // Shortcut - inline
    r = row();
    r.appendChild(label("Shortcut"));
    const modInputs = {};
    [
      ["altKey", "Alt"],
      ["ctrlKey", "Ctrl"],
      ["shiftKey", "Shift"],
      ["metaKey", "Cmd"],
    ].forEach(([k, l]) => {
      const lbl = el(
        "label",
        "display:flex;align-items:center;gap:2px;cursor:pointer;",
      );
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = config.shortcut?.[k] || false;
      modInputs[k] = cb;
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(l));
      r.appendChild(lbl);
    });
    r.appendChild(document.createTextNode("+"));
    const keyInput = input("text", config.shortcut?.key || "d", "");
    keyInput.style.cssText =
      "width:28px;padding:4px;text-align:center;border:1px solid #ccc;border-radius:4px;font:inherit;";
    keyInput.maxLength = 1;
    r.appendChild(keyInput);
    dialog.appendChild(r);

    // Float button - inline
    r = row();
    r.appendChild(label("Float Btn"));
    const floatCb = document.createElement("input");
    floatCb.type = "checkbox";
    floatCb.checked = config.floatingButton?.enabled !== false;
    const floatLbl = el(
      "label",
      "display:flex;align-items:center;gap:3px;cursor:pointer;",
    );
    floatLbl.appendChild(floatCb);
    floatLbl.appendChild(document.createTextNode("On"));
    r.appendChild(floatLbl);
    const sizeSel = select(
      [
        ["small", "S"],
        ["medium", "M"],
        ["large", "L"],
      ],
      config.floatingButton?.size || "medium",
    );
    sizeSel.style.cssText =
      "width:50px;padding:4px;border:1px solid #ccc;border-radius:4px;font:inherit;";
    r.appendChild(sizeSel);
    dialog.appendChild(r);

    dialog.appendChild(divider());

    // Buttons
    const btnRow = el("div", "display:flex;gap:8px;");
    const cancelBtn = el(
      "button",
      "flex:1;padding:7px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;cursor:pointer;font:inherit;",
      "Cancel",
    );
    const saveBtn = el(
      "button",
      "flex:1;padding:7px;background:#2196F3;color:#fff;border:none;border-radius:4px;cursor:pointer;font:inherit;font-weight:500;",
      "Save",
    );
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    dialog.appendChild(btnRow);

    const closeDialog = () => {
      overlay.remove();
      dialog.remove();
    };
    overlay.addEventListener("click", closeDialog);
    cancelBtn.addEventListener("click", closeDialog);
    saveBtn.addEventListener("click", () => {
      config.provider = providerSel.value;
      config.model = modelInput.value;
      config.baseUrl = baseInput.value;
      config.apiKey = apiInput.value;
      config.searchProvider = searchSel.value;
      searchKeys[searchInput.dataset.provider] = searchInput.value;
      config.kagiApiKey = searchKeys.kagi;
      config.braveApiKey = searchKeys.brave;
      config.tavilyApiKey = searchKeys.tavily;
      config.ankiEndpoint = ankiUrlInput.value;
      config.ankiApiKey = ankiKeyInput.value;
      config.language = langSel.value;
      config.shortcut = {
        key: keyInput.value || "d",
        altKey: modInputs.altKey.checked,
        ctrlKey: modInputs.ctrlKey.checked,
        shiftKey: modInputs.shiftKey.checked,
        metaKey: modInputs.metaKey.checked,
      };
      config.floatingButton = {
        enabled: floatCb.checked,
        size: sizeSel.value,
        position: config.floatingButton?.position || "bottom-right",
      };
      saveSettings(config);
      if (onSave) onSave(config);
      closeDialog();
    });

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
  }

  // ============== Main Script ==============
  const isTouchDevice = () =>
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  let floatingButton = null;
  let isProcessingText = false;

  function createFloatingButton() {
    if (floatingButton) return;
    floatingButton = document.createElement("div");
    floatingButton.id = "explainer-floating-button";
    const buttonSize =
      config.floatingButton.size === "small"
        ? "40px"
        : config.floatingButton.size === "large"
          ? "60px"
          : "50px";
    floatingButton.style.cssText = `width:${buttonSize};height:${buttonSize};border-radius:50%;background-color:rgba(33,150,243,0.8);color:white;display:flex;align-items:center;justify-content:center;position:fixed;z-index:9999;box-shadow:0 2px 10px rgba(0,0,0,0.2);cursor:pointer;font-weight:bold;font-size:${parseInt(buttonSize) * 0.4}px;opacity:0;transition:opacity 0.3s ease,transform 0.2s ease;pointer-events:none;`;
    floatingButton.textContent = "?";
    document.body.appendChild(floatingButton);

    function handleButtonAction(e) {
      e.preventDefault();
      e.stopPropagation();
      if (isProcessingText) return;
      const selectionContext = GetSelectionContext();
      if (!selectionContext.selectedText) return;
      isProcessingText = true;
      hideFloatingButton();
      window.getSelection().removeAllRanges();
      processWithContext(selectionContext);
    }

    floatingButton.addEventListener("click", handleButtonAction);
    floatingButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        handleButtonAction(e);
      },
      { passive: false },
    );
  }

  function showFloatingButton() {
    if (!floatingButton || !config.floatingButton.enabled || isProcessingText)
      return;
    const selection = window.getSelection();
    if (
      !selection ||
      selection.rangeCount === 0 ||
      !selection.toString().trim()
    ) {
      hideFloatingButton();
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const buttonSize = parseInt(floatingButton.style.width);
    let top = rect.bottom + 10;
    let left = rect.left + rect.width / 2 - buttonSize / 2;
    if (top + buttonSize > window.innerHeight) top = rect.top - buttonSize - 10;
    left = Math.max(10, Math.min(left, window.innerWidth - buttonSize - 10));
    floatingButton.style.top = `${top}px`;
    floatingButton.style.left = `${left}px`;
    floatingButton.style.opacity = "1";
    floatingButton.style.pointerEvents = "auto";
  }

  function hideFloatingButton() {
    if (!floatingButton) return;
    floatingButton.style.opacity = "0";
    floatingButton.style.pointerEvents = "none";
  }

  GM_addStyle(`
    #explainer-popup{position:absolute;width:450px;min-width:280px;min-height:150px;max-width:90vw;max-height:85vh;padding:20px;padding-top:32px;z-index:2147483647;overflow:hidden;background:rgba(255,255,255,0.95);border-radius:8px;box-shadow:0 5px 15px rgba(0,0,0,0.2);border:1px solid rgba(0,0,0,0.15);color:#111;display:flex;flex-direction:column;resize:both;}
    #explainer-header{position:absolute;top:0;left:0;right:44px;height:32px;cursor:move;user-select:none;}
    #explainer-popup.dark-theme{background:rgba(45,45,50,0.95);color:#e0e0e0;border:1px solid rgba(255,255,255,0.15);}
    #explainer-messages{flex:1;overflow-y:auto;overflow-x:hidden;min-height:50px;}
    .explainer-loading{text-align:center;padding:12px 0;display:flex;align-items:center;justify-content:center;gap:8px;font-size:12px;color:#666;}
    .explainer-loading:before{content:"";width:18px;height:18px;border:2px solid #ddd;border-top:2px solid #2196F3;border-radius:50%;animation:spin 1s linear infinite;display:inline-block;flex-shrink:0;}
    @keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}
    #explainer-error{color:#d32f2f;padding:8px;font-size:14px;display:none;}
    .explainer-followup{margin-top:8px;padding-top:8px;border-top:1px solid rgba(128,128,128,0.2);}
    .explainer-section{position:relative;}
    .explainer-section.collapsed .explainer-section-content{display:none;}
    .explainer-toggle{color:#888;font-size:12px;cursor:pointer;padding:4px 0;padding-right:40px;}
    .explainer-toggle:hover{color:#2196F3;}
    .explainer-user-msg{background:rgba(33,150,243,0.1);padding:6px 10px;border-radius:6px;margin:8px 0 4px;font-size:13px;}
    .explainer-actions{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;}
    .explainer-action-btn{padding:4px 10px;background:transparent;border:1px solid rgba(128,128,128,0.3);border-radius:4px;cursor:pointer;font:inherit;font-size:12px;color:#666;display:flex;align-items:center;gap:4px;transition:all 0.15s;}
    .explainer-action-btn:hover{background:rgba(33,150,243,0.1);border-color:#2196F3;color:#2196F3;}
    .explainer-action-btn:disabled{opacity:0.5;cursor:not-allowed;}
    .explainer-action-btn.success{background:rgba(76,175,80,0.1);border-color:#4CAF50;color:#4CAF50;}
    .explainer-action-btn.error{background:rgba(211,47,47,0.1);border-color:#d32f2f;color:#d32f2f;}
    .dark-theme .explainer-action-btn{border-color:rgba(255,255,255,0.2);color:#aaa;}
    .dark-theme .explainer-action-btn:hover{background:rgba(33,150,243,0.2);color:#64B5F6;}
    .dark-theme .explainer-action-btn.success{background:rgba(76,175,80,0.2);border-color:#81C784;color:#81C784;}
    .dark-theme .explainer-action-btn.error{background:rgba(211,47,47,0.2);border-color:#ef5350;color:#ef5350;}
    #explainer-input-wrap{display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(128,128,128,0.3);}
    #explainer-input{flex:1;padding:6px 10px;border:1px solid #ccc;border-radius:6px;font:inherit;font-size:13px;outline:none;}
    #explainer-input:focus{border-color:#2196F3;}
    #explainer-send{padding:6px 12px;background:#2196F3;color:#fff;border:none;border-radius:6px;cursor:pointer;font:inherit;font-size:13px;}
    #explainer-send:disabled{opacity:0.5;cursor:not-allowed;}
    #explainer-close{position:absolute;top:0;right:0;width:44px;height:44px;border:none;background:transparent;cursor:pointer;font-size:20px;color:#888;line-height:44px;text-align:center;padding:0;z-index:10;}
    #explainer-close:hover{background:rgba(0,0,0,0.1);color:#333;}
    .dark-theme #explainer-close:hover{background:rgba(255,255,255,0.1);color:#fff;}
    .dark-theme #explainer-input{background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.2);color:#e0e0e0;}
    .dark-theme .explainer-user-msg{background:rgba(33,150,243,0.2);}
    @media(prefers-color-scheme:dark){#explainer-popup{background:rgba(35,35,40,0.95);color:#e0e0e0;}#explainer-error{color:#ff8a8a;}}
    #explainer-popup p{margin:0 0 0.5em;}
    #explainer-popup p:last-child{margin-bottom:0;}
    #explainer-popup ul,#explainer-popup ol{margin:0.5em 0;padding-left:1.5em;}
    #explainer-popup li{margin:0.25em 0;}
    #explainer-popup code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:0.9em;background:rgba(0,0,0,0.06);padding:0.15em 0.35em;border-radius:3px;}
    #explainer-popup pre{margin:0.5em 0;padding:0.75em;background:rgba(0,0,0,0.06);border-radius:6px;overflow-x:auto;}
    #explainer-popup pre code{background:none;padding:0;font-size:0.85em;}
    #explainer-popup blockquote{margin:0.5em 0;padding:0.5em 1em;border-left:3px solid #2196F3;background:rgba(33,150,243,0.05);}
    #explainer-popup table{border-collapse:collapse;margin:0.5em 0;font-size:0.9em;}
    #explainer-popup th,#explainer-popup td{border:1px solid rgba(0,0,0,0.15);padding:0.4em 0.6em;}
    #explainer-popup th{background:rgba(0,0,0,0.04);}
    #explainer-popup a{color:#2196F3;text-decoration:none;}
    #explainer-popup a:hover{text-decoration:underline;}
    #explainer-popup h1,#explainer-popup h2,#explainer-popup h3,#explainer-popup h4{margin:0.75em 0 0.5em;font-weight:600;}
    #explainer-popup h1{font-size:1.3em;}#explainer-popup h2{font-size:1.15em;}#explainer-popup h3{font-size:1.05em;}
    .dark-theme #explainer-popup code{background:rgba(255,255,255,0.1);}
    .dark-theme #explainer-popup pre{background:rgba(255,255,255,0.08);}
    .dark-theme #explainer-popup th,.dark-theme #explainer-popup td{border-color:rgba(255,255,255,0.15);}
    .dark-theme #explainer-popup th{background:rgba(255,255,255,0.05);}
  `);

  function isPageDarkMode() {
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    const match = bodyBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const luminance =
        0.299 * parseInt(match[1]) +
        0.587 * parseInt(match[2]) +
        0.114 * parseInt(match[3]);
      return luminance < 128;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function closePopup() {
    const popup = document.getElementById("explainer-popup");
    if (popup) popup.remove();
    const overlay = document.getElementById("explainer-overlay");
    if (overlay) overlay.remove();
    document.removeEventListener("keydown", handleEscKey);
  }

  function handleEscKey(e) {
    if (e.key === "Escape") closePopup();
  }

  function createPopup() {
    closePopup();
    const popup = document.createElement("div");
    popup.id = "explainer-popup";
    popup.dataset.hasFollowups = "false";
    if (isPageDarkMode()) popup.classList.add("dark-theme");

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.id = "explainer-close";
    closeBtn.textContent = "×";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", closePopup);
    popup.appendChild(closeBtn);

    // Drag header (desktop only)
    const header = document.createElement("div");
    header.id = "explainer-header";
    header.title = "Drag to move";
    popup.appendChild(header);

    // Drag functionality
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      dragOffsetX = e.clientX - popup.offsetLeft;
      dragOffsetY = e.clientY - popup.offsetTop;
      popup.style.transition = "none";
    });
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const x = Math.max(0, Math.min(e.clientX - dragOffsetX, window.innerWidth - popup.offsetWidth));
      const y = Math.max(0, Math.min(e.clientY - dragOffsetY, window.innerHeight - popup.offsetHeight));
      popup.style.left = x + "px";
      popup.style.top = y + "px";
    });
    document.addEventListener("mouseup", () => { isDragging = false; });

    const errorDiv = document.createElement("div");
    errorDiv.id = "explainer-error";
    const messagesDiv = document.createElement("div");
    messagesDiv.id = "explainer-messages";
    const loadingDiv = document.createElement("div");
    loadingDiv.id = "explainer-loading";
    loadingDiv.className = "explainer-loading";
    const contentDiv = document.createElement("div");
    contentDiv.id = "explainer-content";
    messagesDiv.appendChild(loadingDiv);
    messagesDiv.appendChild(contentDiv);
    popup.appendChild(errorDiv);
    popup.appendChild(messagesDiv);

    // Follow-up input (hidden initially)
    const inputWrap = document.createElement("div");
    inputWrap.id = "explainer-input-wrap";
    inputWrap.style.display = "none";
    const input = document.createElement("input");
    input.id = "explainer-input";
    input.type = "text";
    input.placeholder = "Ask a follow-up...";
    const sendBtn = document.createElement("button");
    sendBtn.id = "explainer-send";
    sendBtn.textContent = "Send";
    inputWrap.appendChild(input);
    inputWrap.appendChild(sendBtn);
    popup.appendChild(inputWrap);

    document.body.appendChild(popup);

    if (isTouchDevice()) {
      popup.style.cssText +=
        "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:90vw;max-height:85vh;resize:none;";
      header.style.display = "none";
      const overlay = document.createElement("div");
      overlay.id = "explainer-overlay";
      overlay.style.cssText =
        "position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483646;background:transparent;";
      overlay.addEventListener("click", () => {
        if (popup.dataset.hasFollowups !== "true") closePopup();
      });
      document.body.appendChild(overlay);
    } else {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        const scrollTop = window.scrollY;
        popup.style.top = `${rect.bottom + scrollTop + 10}px`;
        popup.style.left = `${Math.max(10, rect.left)}px`;
      } else {
        popup.style.cssText +=
          "top:50%;left:50%;transform:translate(-50%,-50%);";
      }
      // Use mousedown instead of click - click fires on mouseup which can be
      // triggered by releasing a text selection drag, causing false closes
      const outsideClickHandler = (e) => {
        if (!popup.contains(e.target)) {
          if (popup.dataset.hasFollowups !== "true") {
            closePopup();
          }
          document.removeEventListener("mousedown", outsideClickHandler);
        }
      };
      setTimeout(
        () => document.addEventListener("mousedown", outsideClickHandler),
        0,
      );
    }

    document.addEventListener("keydown", handleEscKey);
    return popup;
  }

  let markedConfigured = false;
  function renderMarkdownToSafeHtml(markdown) {
    if (!markdown) return "";
    try {
      // Configure marked on first use
      if (typeof marked !== "undefined" && !markedConfigured) {
        marked.setOptions({ gfm: true, breaks: true });
        markedConfigured = true;
      }
      // Parse markdown to HTML
      const rawHtml = typeof marked !== "undefined"
        ? marked.parse(markdown)
        : markdown.replace(/\n/g, "<br>");

      // Sanitize with DOMPurify
      if (typeof DOMPurify !== "undefined") {
        return DOMPurify.sanitize(rawHtml, {
          ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "s", "code", "pre",
            "ul", "ol", "li", "a", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
            "table", "thead", "tbody", "tr", "th", "td", "hr", "span", "div"],
          ALLOWED_ATTR: ["href", "title", "class"],
          FORBID_ATTR: ["style", "onerror", "onclick", "onload"],
          ALLOW_DATA_ATTR: false,
        });
      }
      return rawHtml;
    } catch (e) {
      console.error("Markdown rendering failed:", e);
      return `<p>${markdown.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`;
    }
  }

  function postProcessLinks(container) {
    container.querySelectorAll("a").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      // Block javascript: URLs
      if (a.href && a.href.toLowerCase().startsWith("javascript:")) {
        a.removeAttribute("href");
        a.style.cursor = "not-allowed";
      }
    });
  }

  function updateContentDisplay(contentDiv, text) {
    if (!text) return;
    const html = renderMarkdownToSafeHtml(text.trim());
    contentDiv.innerHTML = html;
    postProcessLinks(contentDiv);
  }

  // Web search (Kagi, Brave, or Tavily)
  async function webSearch(query) {
    const searchKey = config.searchProvider === "kagi" ? config.kagiApiKey
      : config.searchProvider === "brave" ? config.braveApiKey
      : config.tavilyApiKey;
    if (!searchKey) {
      return Promise.reject(new Error(`${config.searchProvider} API key not configured. Set it in Settings.`));
    }

    if (config.searchProvider === "kagi") {
      const url = `https://kagi.com/api/v0/search?q=${encodeURIComponent(query)}`;
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: {
            "Accept": "application/json",
            "Authorization": `Bot ${searchKey}`,
          },
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              try {
                const data = JSON.parse(res.responseText);
                // t=0 means regular search result (t=1 is related searches)
                const results = (data.data || []).filter(r => r.t === 0).slice(0, 5)
                  .map((r) => `[${r.title}](${r.url})\n${r.snippet}`)
                  .join("\n\n");
                resolve(results || "No results found.");
              } catch (e) {
                reject(new Error("Failed to parse Kagi response"));
              }
            } else {
              reject(new Error(`Kagi error: ${res.status}`));
            }
          },
          onerror: () => reject(new Error("Kagi network error")),
          timeout: 30000,
        });
      });
    } else if (config.searchProvider === "brave") {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`;
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: {
            "Accept": "application/json",
            "X-Subscription-Token": searchKey,
          },
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              try {
                const data = JSON.parse(res.responseText);
                const results = (data.web?.results || []).slice(0, 5)
                  .map((r) => `[${r.title}](${r.url})\n${r.description}`)
                  .join("\n\n");
                resolve(results || "No results found.");
              } catch (e) {
                reject(new Error("Failed to parse Brave response"));
              }
            } else {
              reject(new Error(`Brave error: ${res.status}`));
            }
          },
          onerror: () => reject(new Error("Brave network error")),
          timeout: 30000,
        });
      });
    } else {
      // Tavily
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url: "https://api.tavily.com/search",
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({
            api_key: searchKey,
            query,
            search_depth: "basic",
            max_results: 5,
          }),
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              try {
                const data = JSON.parse(res.responseText);
                const results = (data.results || [])
                  .map((r) => `[${r.title}](${r.url})\n${r.content}`)
                  .join("\n\n");
                resolve(results || "No results found.");
              } catch (e) {
                reject(new Error("Failed to parse Tavily response"));
              }
            } else {
              reject(new Error(`Tavily error: ${res.status}`));
            }
          },
          onerror: () => reject(new Error("Tavily network error")),
          timeout: 30000,
        });
      });
    }
  }

  const webSearchTool = {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information. Use when you need up-to-date info or facts you're unsure about.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  };

  // Anki API (configurable endpoint)
  // Compute SHA1 hash for Anki hkey authentication
  async function sha1(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function addToAnki(front, back, deckName = "Vocab", modelName = "Basic", tags = ["text-explainer"]) {
    if (!config.ankiEndpoint) {
      return Promise.reject(new Error("Anki endpoint not configured. Set it in Settings."));
    }
    if (!config.ankiApiKey) {
      return Promise.reject(new Error("Anki API key not configured. Set it in Settings."));
    }
    const hkey = await sha1(config.ankiApiKey);
    // Convert markdown to HTML for Anki rendering
    const backHtml = renderMarkdownToSafeHtml(back);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `${config.ankiEndpoint}/api/v1/notes/add`,
        headers: {
          "Content-Type": "application/json",
        },
        data: JSON.stringify({
          hkey,
          deck: deckName,
          notetype: modelName,
          fields: { Front: front, Back: backHtml },
          tags,
        }),
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try {
              const data = JSON.parse(res.responseText);
              if (!data.ok) reject(new Error(data.error || "Unknown error"));
              else resolve(`Card added (ID: ${data.data.note_id})`);
            } catch (e) {
              reject(new Error("Failed to parse Anki response"));
            }
          } else {
            reject(new Error(`Anki error: ${res.status}`));
          }
        },
        onerror: () => reject(new Error("Anki network error")),
        timeout: 10000,
      });
    });
  }

  const ankiTool = {
    type: "function",
    function: {
      name: "add_to_anki",
      description: `Add a flashcard to Anki. Use when user wants to memorize something.

DECK SELECTION (important!):
- Use "Vocab" deck for: single words, phrases, idioms, expressions, terminology
- Use "Knowledge" deck for: concepts, facts, explanations, how things work, technical knowledge

Use Markdown formatting (will be converted to HTML automatically).

VOCABULARY CARD FORMAT (deckName="Vocab"):
Front: just the word

Back format (Markdown):
**word** /IPA/

**定义:** Part of speech + definition

**语境:** Context explanation

**例句:**
- Example sentence 1
- Example sentence 2

Example:
Front: "turf"
Back: "**turf** /tɜːrf/\\n\\n**定义:** 名词，草皮；草坪——带有草根和土壤的草皮块。\\n\\n**语境:** 此处指铺设的草皮草坪，与后文的 mossy mess 形成对比。\\n\\n**例句:**\\n- The gardener laid fresh turf to create a new lawn.\\n- After the match, the turf was badly damaged."

FACTS/CONCEPTS CARD FORMAT (deckName="Knowledge"):
Front: Specific question (prefer "why/how" over "what")

Back format (Markdown):
**Answer:** Concise answer

**Why:** Brief reasoning

**Related:** Connection to concepts (optional)

Example:
Front: "Why does QuickSort average O(n log n)?"
Back: "**Answer:** Each partition divides array in half → log n levels, n comparisons each.\\n\\n**Why:** Pivot selection determines balance—random pivots avoid worst-case O(n²).\\n\\n**Related:** Similar to merge sort's divide-and-conquer, but in-place."`,
      parameters: {
        type: "object",
        properties: {
          front: { type: "string", description: "The word/phrase for vocabulary, or a question for facts." },
          back: { type: "string", description: "Card back in Markdown: pronunciation, definition, context, examples." },
          deckName: { type: "string", description: "Deck name: 'Vocab' for vocabulary, 'Knowledge' for facts/concepts", default: "Vocab" },
          tags: { type: "array", items: { type: "string" }, description: "Tags like: topic::science, source::article, priority::high" },
        },
        required: ["front", "back"],
      },
    },
  };

  async function callLLM(messages, systemPrompt, progressCallback, statusCallback) {
    const provider = config.provider || "gemini";
    const hasSearchKey = config.searchProvider === "kagi" ? !!config.kagiApiKey
      : config.searchProvider === "brave" ? !!config.braveApiKey : !!config.tavilyApiKey;
    const useTools = hasSearchKey && provider !== "gemini";

    async function makeRequest(msgs, stream = true) {
      let url, headers, body;

      if (provider === "gemini") {
        url = `${config.baseUrl}/v1beta/models/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;
        headers = { "Content-Type": "application/json" };
        const contents = msgs.map((m) => ({
          parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
          role: m.role === "assistant" ? "model" : "user",
        }));
        body = JSON.stringify({
          contents,
          systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
          generationConfig: { temperature: 0.7 },
        });
      } else if (provider === "anthropic") {
        url = `${config.baseUrl}/v1/messages`;
        headers = {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        };
        const anthropicMsgs = msgs.map((m) => {
          if (m.role === "tool") {
            return { role: "user", content: [{ type: "tool_result", tool_use_id: m.tool_call_id, content: m.content }] };
          }
          if (m.tool_calls) {
            return { role: "assistant", content: m.tool_calls.map((tc) => ({ type: "tool_use", id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) })) };
          }
          return { role: m.role, content: m.content };
        });
        body = JSON.stringify({
          model: config.model,
          max_tokens: 4096,
          system: systemPrompt || "",
          messages: anthropicMsgs,
          stream,
          ...(useTools ? { tools: [
            { name: "web_search", description: webSearchTool.function.description, input_schema: webSearchTool.function.parameters },
            { name: "add_to_anki", description: ankiTool.function.description, input_schema: ankiTool.function.parameters },
          ] } : {}),
        });
      } else {
        // OpenAI-compatible
        url = `${config.baseUrl}/v1/chat/completions`;
        headers = { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` };
        if (provider === "openrouter") {
          headers["HTTP-Referer"] = window.location.origin;
          headers["X-Title"] = "Text Explainer";
        }
        body = JSON.stringify({
          model: config.model,
          messages: [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), ...msgs],
          stream,
          ...(useTools ? { tools: [webSearchTool, ankiTool] } : {}),
        });
      }

      return new Promise((resolve, reject) => {
        let fullText = "";
        let toolCalls = null;

        function parseSSE(text) {
          let result = "", calls = null;
          for (const line of text.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              if (provider === "gemini") {
                result += json.candidates?.[0]?.content?.parts?.[0]?.text || "";
              } else if (provider === "anthropic") {
                if (json.type === "content_block_delta") result += json.delta?.text || "";
                if (json.type === "content_block_start" && json.content_block?.type === "tool_use") {
                  calls = calls || [];
                  calls.push({ id: json.content_block.id, type: "function", function: { name: json.content_block.name, arguments: "" } });
                }
                if (json.type === "content_block_delta" && json.delta?.type === "input_json_delta" && calls) {
                  calls[calls.length - 1].function.arguments += json.delta.partial_json || "";
                }
              } else {
                result += json.choices?.[0]?.delta?.content || "";
                const tc = json.choices?.[0]?.delta?.tool_calls;
                if (tc) {
                  calls = calls || [];
                  tc.forEach((t) => {
                    const idx = t.index ?? 0;
                    if (t.id) calls[idx] = { id: t.id, type: "function", function: { name: t.function?.name || "", arguments: "" } };
                    else if (calls[idx] && t.function?.arguments) calls[idx].function.arguments += t.function.arguments;
                  });
                }
              }
            } catch (e) {}
          }
          return { text: result, toolCalls: calls };
        }

        GM_xmlhttpRequest({
          method: "POST", url, headers, data: body,
          onprogress: stream ? (res) => {
            if (!res.responseText) return;
            const { text, toolCalls: tc } = parseSSE(res.responseText);
            if (tc) toolCalls = tc;
            if (text && text.length > fullText.length) {
              const delta = text.slice(fullText.length);
              fullText = text;
              if (progressCallback && delta) progressCallback(delta, fullText);
            }
          } : undefined,
          onload: (res) => {
            if (res.status < 200 || res.status >= 300) {
              reject(new Error(`HTTP ${res.status}: ${res.responseText || res.statusText}`));
              return;
            }
            if (stream) {
              const { text, toolCalls: tc } = parseSSE(res.responseText);
              resolve({ text: text || fullText, toolCalls: tc || toolCalls });
            } else {
              try {
                const json = JSON.parse(res.responseText);
                if (provider === "anthropic") {
                  const content = json.content || [];
                  const text = content.filter((c) => c.type === "text").map((c) => c.text).join("");
                  const tools = content.filter((c) => c.type === "tool_use").map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input) } }));
                  resolve({ text, toolCalls: tools.length ? tools : null });
                } else {
                  const choice = json.choices?.[0];
                  resolve({ text: choice?.message?.content || "", toolCalls: choice?.message?.tool_calls || null });
                }
              } catch (e) {
                reject(new Error("Failed to parse response"));
              }
            }
          },
          onerror: () => reject(new Error("Network error")),
          ontimeout: () => reject(new Error("Request timed out")),
          timeout: 60000,
        });
      });
    }

    // Tool call loop
    let currentMsgs = [...messages];
    let finalText = "";
    const maxIterations = 5;
    let hadToolCalls = false;

    for (let i = 0; i < maxIterations; i++) {
      const isLast = i === maxIterations - 1;
      const shouldStream = !hadToolCalls || isLast;
      const { text, toolCalls } = await makeRequest(currentMsgs, shouldStream);

      if (text) {
        finalText += text;
        if (progressCallback) progressCallback(text, finalText);
      }

      if (!toolCalls || !useTools) {
        return finalText;
      }

      hadToolCalls = true;
      // Execute tool calls - content should be null when only tool calls, per OpenAI spec
      currentMsgs.push({ role: "assistant", content: text || null, tool_calls: toolCalls });

      for (const tc of toolCalls) {
        const toolName = tc.function?.name;
        if (!toolName) continue;
        try {
          const args = JSON.parse(tc.function.arguments || "{}");
          if (toolName === "web_search") {
            if (!args.query) continue;
            if (statusCallback) statusCallback(`🔍 Searching: ${args.query}...`);
            const result = await webSearch(args.query);
            currentMsgs.push({ role: "tool", tool_call_id: tc.id, name: toolName, content: result });
          } else if (toolName === "add_to_anki") {
            if (statusCallback) statusCallback(`📝 Adding to Anki...`);
            const result = await addToAnki(args.front, args.back, args.deckName || "Vocab", "Basic", args.tags || ["text-explainer"]);
            currentMsgs.push({ role: "tool", tool_call_id: tc.id, name: toolName, content: result });
          }
          if (statusCallback) statusCallback("");
        } catch (e) {
          currentMsgs.push({ role: "tool", tool_call_id: tc.id, name: toolName, content: `Error: ${e.message}` });
          if (statusCallback) statusCallback("");
        }
      }
    }

    return finalText;
  }

  function getPrompt(selectedText, paragraphText, textBefore, textAfter) {
    // Count "words" - for CJK, count characters (~2 chars = 1 word); for others, split by space
    const cjkChars = (
      selectedText.match(
        /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g,
      ) || []
    ).length;
    const textWithoutCJK = selectedText.replace(
      /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g,
      "",
    );
    const nonCJKWords = textWithoutCJK.split(/\s+/).filter((w) => w).length;
    const wordsCount = Math.ceil(cjkChars / 2) + nonCJKWords;

    const hasSearchKeyForHint = config.kagiApiKey || config.braveApiKey || config.tavilyApiKey;
    const toolHint = hasSearchKeyForHint ? `
- Use web_search tool if you need current information or are unsure about facts
- Use add_to_anki tool when user asks to save/memorize something
- For vocab cards: Front=word, Back=pronunciation+definition+context+examples` : "";
    const systemPrompt = `Respond in ${config.language} with HTML tags to improve readability.
- Prioritize clarity and conciseness
- Use bullet points when appropriate${toolHint}`;

    if (wordsCount >= 500) {
      return {
        prompt: `Create a structured summary in ${config.language}:
- Identify key themes and concepts
- Extract 3-5 main points
- Use nested <ul> lists for hierarchy
- Keep bullets concise

for the following selected text:
\n\n${selectedText}`,
        systemPrompt,
      };
    }

    if (wordsCount >= 5) {
      return {
        prompt: `Translate exactly to ${config.language} without commentary:
- Preserve technical terms and names
- Maintain original punctuation
- Match formal/informal tone of source

for the following selected text:
\n\n${selectedText}`,
        systemPrompt,
      };
    }

    const pinYinExtraPrompt =
      config.language === "Chinese" ? " DO NOT add Pinyin for it." : "";
    const ipaExtraPrompt =
      config.language === "Chinese" ? "(with IPA if necessary)" : "";
    const asciiChars = selectedText
      .replace(/[\s\.,\-_'"!?()]/g, "")
      .split("")
      .filter((char) => char.charCodeAt(0) <= 127).length;
    const sampleSentenceLanguage =
      selectedText.length === asciiChars ? "English" : config.language;

    const contextPrompt =
      textBefore || textAfter
        ? `# Context:
## Before selected text:
${textBefore || "None"}
## Selected text:
${selectedText}
## After selected text:
${textAfter || "None"}`
        : paragraphText;

    return {
      prompt: `Provide an explanation for the word: "${selectedText}${ipaExtraPrompt}" in ${config.language} without commentary.${pinYinExtraPrompt}

Use the context from the surrounding paragraph to inform your explanation when relevant:

${contextPrompt}

# Consider these scenarios:

## Names
If "${selectedText}" is a person's name, company name, or organization name, provide a brief description (e.g., who they are or what they do).

## Technical Terms
If "${selectedText}" is a technical term or jargon:
- Give a concise definition and explain
- Some best practice of using it
- Explain how it works
- No need example sentence for technical terms

## Normal Words
For any other word, explain its meaning and provide 1-2 example sentences with the word in ${sampleSentenceLanguage}.

# Format
- Output the words first, then the explanation, and then the example sentences in ${sampleSentenceLanguage} if necessary.
- No extra explanation
- Use proper HTML format like <p> <b> <i> <li> <ol> <ul> to improve readability.`,
      systemPrompt,
    };
  }

  async function processWithContext(selectionContext) {
    createPopup();
    const popup = document.getElementById("explainer-popup");
    const messagesDiv = document.getElementById("explainer-messages");
    const contentDiv = document.getElementById("explainer-content");
    const loadingDiv = document.getElementById("explainer-loading");
    const errorDiv = document.getElementById("explainer-error");
    const inputWrap = document.getElementById("explainer-input-wrap");
    const input = document.getElementById("explainer-input");
    const sendBtn = document.getElementById("explainer-send");
    loadingDiv.style.display = "block";

    const { prompt, systemPrompt } = getPrompt(
      selectionContext.selectedText,
      selectionContext.paragraphText,
      selectionContext.textBefore,
      selectionContext.textAfter,
    );

    const conversation = [{ role: "user", content: prompt }];
    let currentSystemPrompt = systemPrompt;
    const sections = []; // Track collapsible sections

    const createSection = (contentEl) => {
      const section = document.createElement("div");
      section.className = "explainer-section";
      const toggle = document.createElement("div");
      toggle.className = "explainer-toggle";
      toggle.textContent = "▼ Collapse";
      toggle.addEventListener("click", () => {
        const collapsed = section.classList.toggle("collapsed");
        toggle.textContent = collapsed ? "▶ Show previous response..." : "▼ Collapse";
        section.dataset.autoFold = collapsed ? "true" : "false";
      });
      const content = document.createElement("div");
      content.className = "explainer-section-content";
      content.appendChild(contentEl);
      section.appendChild(toggle);
      section.appendChild(content);
      return section;
    };

    const createActionBar = (container) => {
      const actionsDiv = document.createElement("div");
      actionsDiv.className = "explainer-actions";
      const addAnkiBtn = document.createElement("button");
      addAnkiBtn.className = "explainer-action-btn";
      addAnkiBtn.innerHTML = "📝 Add to Anki";
      addAnkiBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        popup.dataset.hasFollowups = "true";
        addAnkiBtn.disabled = true;
        addAnkiBtn.innerHTML = "⏳ Adding...";
        input.value = "Add this to Anki. Choose the appropriate format: Vocab deck for words/phrases, Knowledge deck for facts/concepts.";
        try {
          await sendFollowUp();
          addAnkiBtn.classList.add("success");
          addAnkiBtn.innerHTML = "✓ Added";
        } catch (err) {
          addAnkiBtn.classList.add("error");
          addAnkiBtn.innerHTML = "✗ Failed";
          addAnkiBtn.disabled = false;
        }
      });
      actionsDiv.appendChild(addAnkiBtn);
      container.appendChild(actionsDiv);
    };

    const foldPreviousSections = () => {
      sections.forEach((s, i) => {
        if (s.dataset.autoFold !== "false") {
          s.classList.add("collapsed");
          s.dataset.autoFold = "true";
          const toggle = s.querySelector(".explainer-toggle");
          if (toggle) toggle.textContent = i === 0 ? "▶ Show initial response..." : "▶ Show previous response...";
        }
      });
    };

    const sendFollowUp = async () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      sendBtn.disabled = true;
      popup.dataset.hasFollowups = "true";

      // Fold previous sections
      foldPreviousSections();

      // Add user message to UI
      const userMsg = document.createElement("div");
      userMsg.className = "explainer-user-msg";
      userMsg.textContent = text;
      messagesDiv.appendChild(userMsg);

      // Add loading spinner
      const followupLoading = document.createElement("div");
      followupLoading.className = "explainer-loading";
      messagesDiv.appendChild(followupLoading);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      conversation.push({ role: "user", content: text });

      try {
        let responseText = "";
        let followupDiv = null;
        let section = null;
        await callLLM(
          conversation,
          currentSystemPrompt,
          (delta, fullText) => {
            responseText = fullText;
            if (!followupDiv) {
              followupLoading.remove();
              followupDiv = document.createElement("div");
              followupDiv.className = "explainer-followup";
              section = createSection(followupDiv);
              sections.push(section);
              messagesDiv.appendChild(section);
            }
            updateContentDisplay(followupDiv, responseText);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          },
          (status) => {
            followupLoading.textContent = status;
          },
        );
        if (responseText) {
          if (!followupDiv) {
            followupLoading.remove();
            followupDiv = document.createElement("div");
            followupDiv.className = "explainer-followup";
            section = createSection(followupDiv);
            sections.push(section);
            messagesDiv.appendChild(section);
          }
          updateContentDisplay(followupDiv, responseText);
          conversation.push({ role: "assistant", content: responseText });
          createActionBar(followupDiv);
        }
      } catch (error) {
        followupLoading.remove();
        const errDiv = document.createElement("div");
        errDiv.className = "explainer-followup";
        errDiv.textContent = `Error: ${error.message}`;
        errDiv.style.color = "#d32f2f";
        messagesDiv.appendChild(errDiv);
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    };

    sendBtn.addEventListener("click", sendFollowUp);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendFollowUp();
      }
    });

    try {
      let responseText = "";
      await callLLM(
        conversation,
        systemPrompt,
        (delta, fullText) => {
          responseText = fullText;
          loadingDiv.style.display = "none";
          updateContentDisplay(contentDiv, responseText);
        },
        (status) => {
          loadingDiv.textContent = status;
        },
      );
      if (responseText) {
        updateContentDisplay(contentDiv, responseText);
        conversation.push({ role: "assistant", content: responseText });
        // Wrap initial response in a section for folding
        const wrapper = document.createElement("div");
        wrapper.className = "explainer-section";
        contentDiv.parentNode.insertBefore(wrapper, contentDiv);
        const toggle = document.createElement("div");
        toggle.className = "explainer-toggle";
        toggle.textContent = "▼ Collapse";
        toggle.addEventListener("click", () => {
          const collapsed = wrapper.classList.toggle("collapsed");
          toggle.textContent = collapsed ? "▶ Show initial response..." : "▼ Collapse";
          wrapper.dataset.autoFold = collapsed ? "true" : "false";
        });
        const content = document.createElement("div");
        content.className = "explainer-section-content";
        content.appendChild(contentDiv);
        wrapper.appendChild(toggle);
        wrapper.appendChild(content);
        sections.push(wrapper);
        createActionBar(content);

        // Show follow-up input
        inputWrap.style.display = "flex";
      }
    } catch (error) {
      errorDiv.textContent = error.message;
      errorDiv.style.display = "block";
      loadingDiv.style.display = "none";
    } finally {
      setTimeout(() => {
        isProcessingText = false;
      }, 500);
    }
  }

  async function processSelectedText() {
    const selectionContext = GetSelectionContext();
    if (!selectionContext.selectedText) return;
    await processWithContext(selectionContext);
  }

  function handleKeyPress(e) {
    const shortcut = config.shortcut || { key: "d", altKey: true };
    if (
      e.altKey === !!shortcut.altKey &&
      e.ctrlKey === !!shortcut.ctrlKey &&
      e.shiftKey === !!shortcut.shiftKey &&
      e.metaKey === !!shortcut.metaKey
    ) {
      const key = shortcut.key.toLowerCase();
      if (e.key.toLowerCase() === key || e.code === `Key${key.toUpperCase()}`) {
        e.preventDefault();
        processSelectedText();
      }
    }
  }

  function init() {
    GM_registerMenuCommand("Text Explainer Settings", () =>
      openSettingsDialog((updated) => {
        config = updated;
      }),
    );
    document.addEventListener("keydown", handleKeyPress);
    if (isTouchDevice() && config.floatingButton.enabled) {
      createFloatingButton();
      document.addEventListener("selectionchange", () => {
        if (!isProcessingText) setTimeout(showFloatingButton, 100);
      });
    }
    console.log("Text Explainer initialized");
  }

  init();
})();
