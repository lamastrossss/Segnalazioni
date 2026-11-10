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

/** Copia del tool inclusa nell'estensione: si usa quando il sito blocca quella online. */
export const BUNDLED_TOOL = 'tool.js';

/**
 * Eseguita NEL MONDO MAIN della pagina (serializzata da chrome.scripting): niente variabili esterne.
 * mode 'toggle' apre o chiude; mode 'auto' apre solo se il tool non è attivo né in caricamento.
 * Aspetta il caricamento dello script: 'blocked' se il sito non lo lascia partire
 * (regole di sicurezza CSP, tipiche dei checkout).
 */
export function pageLoader(toolUrl, mode) {
  var w = window;
  if (w.__stageReview) {
    if (mode === 'toggle') { w.__stageReview.destroy(); return 'closed'; }
    return 'active';
  }
  if (w.__stageReviewLoading) return 'loading';
  w.__stageReviewLoading = true;
  return new Promise(function (resolve) {
    var s = document.createElement('script');
    var timer = setTimeout(function () { resolve('opened'); }, 15000); // niente costanti esterne: la funzione viene serializzata
    s.src = toolUrl + '?v=' + Date.now() + (mode === 'auto' ? '&auto=1' : '');
    s.onload = function () { clearTimeout(timer); resolve('opened'); };
    s.onerror = function () { clearTimeout(timer); w.__stageReviewLoading = false; s.remove(); resolve('blocked'); };
    document.documentElement.appendChild(s);
  });
}

/**
 * Eseguita nel MONDO ISOLATO dell'estensione, dove gira la copia interna del tool.
 * Se lì il tool è già aperto lo chiude (toggle) o lo lascia (auto); altrimenti risponde 'none'.
 */
export function isolatedToggle(mode) {
  var w = window;
  if (w.__stageReview) {
    if (mode === 'toggle') { w.__stageReview.destroy(); return 'closed'; }
    return 'active';
  }
  return w.__stageReviewLoading ? 'loading' : 'none';
}

/** Eseguita nel mondo ISOLATO subito prima della copia interna: le passa la modalità di avvio. */
export function prepareBundled(mode) {
  window.__stageReviewLoading = true;
  window.__stageReviewAuto = mode === 'auto';
}

/** Eseguita nella pagina (mondo MAIN o ISOLATO): il tool è aperto? */
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
    const target = { tabId };
    try {
      await chrome.scripting.executeScript({ target, files: ['bridge.js'] });
      // Il tool può essere aperto nella copia interna (siti che bloccano quella online)
      const [iso] = await chrome.scripting.executeScript({ target, func: isolatedToggle, args: [mode] });
      if (iso?.result && iso.result !== 'none') return iso.result;
      const [res] = await chrome.scripting.executeScript({
        target, world: 'MAIN', func: pageLoader, args: [toolUrl, mode],
      });
      const result = res?.result ?? 'error';
      if (result !== 'blocked') return result;
      // Il sito blocca gli script esterni: si avvia la copia inclusa nell'estensione,
      // nel mondo isolato, dove le regole di sicurezza della pagina non valgono.
      await chrome.scripting.executeScript({ target, func: prepareBundled, args: [mode] });
      await chrome.scripting.executeScript({ target, files: [BUNDLED_TOOL] });
      return 'opened';
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
        for (const world of ['ISOLATED', 'MAIN']) {
          const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world, func: isActiveProbe });
          if (res?.result) return true;
        }
        return false;
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
