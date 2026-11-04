import { boot } from './boot';

function isAutoStart(): boolean {
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
