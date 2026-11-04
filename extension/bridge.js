// Ponte tra la pagina (dove gira il tool) e l'estensione, per gli screenshot senza dialogo.
// Gira nel "mondo isolato": vede il DOM della pagina ma non le sue variabili JavaScript.
(() => {
  if (globalThis.__srBridge) return;
  globalThis.__srBridge = true;
  document.documentElement.dataset.stageReviewExt = '1';

  const reply = (id, dataUrl) =>
    window.postMessage({ source: 'stage-review-ext', type: 'capture-result', id, dataUrl }, location.origin === 'null' ? '*' : location.origin);

  window.addEventListener('message', e => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== 'stage-review' || d.type !== 'capture' || typeof d.id !== 'string') return;
    if (!document.getElementById('stage-review-root')) return; // risponde solo con il tool aperto
    try {
      chrome.runtime.sendMessage({ type: 'capture' })
        .then(r => reply(d.id, (r && r.dataUrl) || null))
        .catch(() => reply(d.id, null));
    } catch {
      // Estensione ricaricata o aggiornata: questo ponte non funziona più. Il tool ripiega su "Condividi scheda".
      delete document.documentElement.dataset.stageReviewExt;
      reply(d.id, null);
    }
  });
})();
