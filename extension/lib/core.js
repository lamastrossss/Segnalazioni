// Logica dell'estensione Stage Review, senza dipendenze (testabile con un chrome simulato).

const BLOCKED = [/^https:\/\/chromewebstore\.google\.com\//, /^https:\/\/chrome\.google\.com\/webstore/];
const CAPTURE_MIN_INTERVAL_MS = 500;

export function isScriptable(url) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return false;
  return !BLOCKED.some(re => re.test(url));
}

export function originOf(url) {
  return new URL(url).origin;
}

/**
 * Eseguita NEL MONDO MAIN della pagina (serializzata da chrome.scripting): niente variabili esterne.
 * mode 'toggle' apre o chiude; mode 'auto' apre solo se il tool non è attivo né in caricamento.
 */
export function pageLoader(toolUrl, mode) {
  var w = window;
  if (w.__stageReview) {
    if (mode === 'toggle') { w.__stageReview.destroy(); return 'closed'; }
    return 'active';
  }
  if (w.__stageReviewLoading) return 'loading';
  w.__stageReviewLoading = true;
  var s = document.createElement('script');
  s.src = toolUrl + '?v=' + Date.now() + (mode === 'auto' ? '&auto=1' : '');
  s.onerror = function () { w.__stageReviewLoading = false; alert('Stage Review: questo sito blocca il tool.'); };
  document.documentElement.appendChild(s);
  return 'opened';
}

/** Eseguita nel mondo MAIN: il tool è aperto? */
export function isActiveProbe() {
  return !!window.__stageReview;
}

export function createController(chrome, { toolUrl, now = () => Date.now() }) {
  let lastCapture = -Infinity;

  async function getAlwaysOn() {
    const { alwaysOn = [] } = await chrome.storage.sync.get('alwaysOn');
    return Array.isArray(alwaysOn) ? alwaysOn : [];
  }

  async function inject(tabId, mode) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['bridge.js'] });
      const [res] = await chrome.scripting.executeScript({
        target: { tabId }, world: 'MAIN', func: pageLoader, args: [toolUrl, mode],
      });
      return res?.result ?? 'error';
    } catch {
      return 'error';
    }
  }

  return {
    inject,
    getAlwaysOn,

    async toggle(tab) {
      if (!tab?.id || !isScriptable(tab.url)) return 'unsupported';
      return inject(tab.id, 'toggle');
    },

    async isActive(tab) {
      if (!tab?.id || !isScriptable(tab.url)) return false;
      try {
        const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: isActiveProbe });
        return !!res?.result;
      } catch {
        return false;
      }
    },

    async setAlwaysOn(origin, on) {
      const list = await getAlwaysOn();
      const next = on ? [...new Set([...list, origin])] : list.filter(o => o !== origin);
      await chrome.storage.sync.set({ alwaysOn: next });
      if (!on) {
        try { await chrome.permissions.remove({ origins: [origin + '/*'] }); } catch { /* già revocato */ }
      }
    },

    async onTabUpdated(tabId, info, tab) {
      try {
        if (info?.status !== 'complete' || !isScriptable(tab?.url)) return;
        const origin = originOf(tab.url);
        if (!(await getAlwaysOn()).includes(origin)) return;
        if (!(await chrome.permissions.contains({ origins: [origin + '/*'] }))) return;
        await inject(tabId, 'auto');
        await chrome.action.setBadgeText({ tabId, text: 'ON' });
      } catch { /* scheda chiusa o non accessibile */ }
    },

    async capture(sender) {
      const t = now();
      if (t - lastCapture < CAPTURE_MIN_INTERVAL_MS) return null;
      lastCapture = t;
      try {
        return await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 90 });
      } catch {
        return null;
      }
    },
  };
}
