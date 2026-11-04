import { boot } from './boot';

void boot(window).catch(err => {
  console.error('[Stage Review]', err);
  alert('Stage Review: avvio non riuscito. Riprova o ricarica la pagina.');
});
