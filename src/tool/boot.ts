import type { Api } from '../shared/api';
import type { Auth } from '../shared/auth';
import type { LiveAdapter } from '../shared/live';
import { createApi } from '../shared/api';
import { createAuth } from '../shared/auth';
import { createLive } from '../shared/live';
import { getClient } from '../shared/supabase';
import { renderAuthForm } from '../shared/auth-ui';
import { el } from '../shared/dom';
import { mountRoot } from './root';
import { pickProject } from './project-picker';
import { createSession, type Session } from './session';

export interface ToolInstance { destroy(): void }
export interface BootDeps { api: Api; auth: Auth; live: LiveAdapter }
type ToolWindow = Window & { __stageReview?: ToolInstance; __stageReviewLoading?: boolean };

/**
 * Avvia il tool. Se è già attivo: con un avvio manuale lo chiude (comportamento "toggle"),
 * con un avvio automatico (estensione "sempre attivo") non fa niente.
 */
export async function boot(win: Window, deps: Partial<BootDeps> = {}, opts: { auto?: boolean } = {}): Promise<ToolInstance | null> {
  const w = win as ToolWindow;
  w.__stageReviewLoading = false;
  if (w.__stageReview) {
    if (!opts.auto) w.__stageReview.destroy();
    return null;
  }

  const root = mountRoot(win.document);
  let session: Session | null = null;
  let destroyed = false;
  const instance: ToolInstance = {
    destroy() {
      destroyed = true;
      session?.destroy();
      root.destroy();
      if (w.__stageReview === instance) delete w.__stageReview;
    },
  };
  w.__stageReview = instance;

  const needsClient = !deps.api || !deps.auth || !deps.live;
  const client = needsClient ? getClient() : null;
  const api = deps.api ?? createApi(client!);
  const auth = deps.auth ?? createAuth(client!);
  const live = deps.live ?? createLive(client!);

  const fatal = (message: string) => {
    root.shadow.append(el('div', { class: 'sr sr-panel' }, [
      el('h2', { text: 'Stage Review' }),
      el('p', { class: 'sr-error-text', text: message }),
      el('button', { class: 'sr-btn sr-ghost', text: 'Chiudi', on: { click: () => instance.destroy() } }),
    ]));
  };

  const me = (await auth.current()) ?? (await renderAuthForm(root.shadow, auth));
  if (destroyed) return null;

  const domain = win.location.hostname.toLowerCase();
  const found = await api.findProjectByDomain(domain);
  if (destroyed) return null;
  if (!found.ok) { fatal(found.error.message); return instance; }
  const project = found.value ?? (await pickProject(root.shadow, api, domain));
  if (destroyed) return null;
  if (!project) { instance.destroy(); return null; }

  session = createSession({ win, root, api, auth, live, me, project, onClose: () => instance.destroy() });
  return instance;
}
