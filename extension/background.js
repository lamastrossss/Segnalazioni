import { TOOL_URL } from './config.js';
import { createController } from './lib/core.js';

const controller = createController(chrome, { toolUrl: TOOL_URL });

chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-stage-review') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await controller.toggle(tab);
  } catch { /* nessuna scheda attiva */ }
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => { void controller.onTabUpdated(tabId, info, tab); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'capture' || !sender.tab) return false;
  controller.capture(sender).then(dataUrl => sendResponse({ dataUrl })).catch(() => sendResponse({ dataUrl: null }));
  return true; // risposta asincrona
});
