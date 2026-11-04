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

/**
 * "Sempre attivo" su un sito = permesso concesso per quel sito (richiesto dal menu dell'icona).
 * Il permesso è l'unica fonte di verità: resta valido anche se il menu si chiude durante la richiesta.
 */
export function createController(chrome, { toolUrl, now = () => Date.now() }) {
  let lastCapture = -Infinity;

  async function isAlwaysOn(origin) {
    try { return await chrome.permissions.contains({ origins: [origin + '/*'] }); } catch { return false; }
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
    isAlwaysOn,

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
      if (on) return; // il permesso lo concede l'utente dal menu (chrome.permissions.request)
      try { await chrome.permissions.remove({ origins: [origin + '/*'] }); } catch { /* già revocato */ }
    },

    async onTabUpdated(tabId, info, tab) {
      try {
        if (info?.status !== 'complete' || !isScriptable(tab?.url)) return;
        if (!(await isAlwaysOn(originOf(tab.url)))) return;
        if ((await inject(tabId, 'auto')) === 'error') return;
        await chrome.action.setBadgeText({ tabId, text: 'ON' });
      } catch { /* scheda chiusa o non accessibile */ }
    },

    /** Solo dal frame principale della scheda visibile: un'altra scheda non può farsi fotografare quella attiva. */
    async capture(sender) {
      if (sender?.frameId !== 0 || !sender?.tab?.active) return null;
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
