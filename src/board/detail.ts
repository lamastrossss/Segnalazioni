import type { Profile } from '../shared/types';
import type { Api } from '../shared/api';
import { el } from '../shared/dom';
import { withFocusHash } from '../shared/page';
import { TOOL_CSS } from '../tool/styles';
import { createComposer } from '../tool/composer';

export interface DetailDeps {
  api: Api; me: () => Profile | null; projectId: string; profilesById: Map<string, Profile>;
  reauth: () => Promise<Profile>; onChanged: (issueId: string) => void;
}

/** Pannello laterale della segnalazione nella board: stesso thread del tool, più "Apri nel sito". */
export function renderDetail(container: HTMLElement, deps: DetailDeps) {
  const host = el('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = TOOL_CSS + '.sr-panel { top: 16px; right: 16px; max-height: calc(100vh - 32px); width: min(440px, calc(100vw - 32px)); }';
  shadow.append(style);
  container.append(host);

  const composer = createComposer(shadow, {
    ...deps,
    onSaved: () => {},
    threadExtras: issue => [
      el('div', { class: 'sr-row', attrs: { style: 'margin:8px 0' } }, [
        el('button', { class: 'sr-btn', text: 'Apri nel sito', attrs: { type: 'button' },
          on: { click: () => { window.open(withFocusHash(issue.page_url, issue.id), '_blank', 'noopener'); } } }),
        el('span', { class: 'sr-muted', text: 'Poi apri Stage Review dall’icona dell’estensione (o Alt+Shift+R) per vedere il pin.' }),
      ]),
    ],
  });
  return {
    open: (issueId: string) => composer.openThread(issueId),
    close: () => composer.close(),
    current: () => composer.currentThread(),
    refreshIfIdle: (id: string) => composer.refreshIfIdle(id),
  };
}
