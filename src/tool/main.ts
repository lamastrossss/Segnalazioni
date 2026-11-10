import { boot } from './boot';

function isAutoStart(): boolean {
  // Copia inclusa nell'estensione: non c'è un <script src>, la modalità arriva da una variabile
  const w = window as Window & { __stageReviewAuto?: boolean };
  if (typeof w.__stageReviewAuto === 'boolean') {
    const auto = w.__stageReviewAuto;
    delete w.__stageReviewAuto;
    return auto;
  }
  try {
    const src = (document.currentScript as HTMLScriptElement | null)?.src;
    return !!src && new URL(src).searchParams.get('auto') === '1';
  } catch {
    return false;
  }
}

void boot(window, {}, { auto: isAutoStart() }).catch(err => {
  console.error('[Stage Review]', err);
  alert('Stage Review: avvio non riuscito. Riprova o ricarica la pagina.');
});
