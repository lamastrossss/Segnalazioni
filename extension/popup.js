import { TOOL_BASE } from './config.js';
import { initPopup } from './lib/popup.js';

void initPopup(document, chrome, { toolBase: TOOL_BASE, version: chrome.runtime.getManifest().version });
