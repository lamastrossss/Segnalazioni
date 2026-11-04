import type { Api } from '../shared/api';
import type { Auth } from '../shared/auth';
import type { LiveAdapter } from '../shared/live';
import type { Profile, Project, ViewportClass } from '../shared/types';
import { classifyViewport } from '../shared/viewport';
import { CONFIG } from '../config';
import { createToolbar } from './toolbar';

export interface SessionCtx {
  win: Window; root: { host: HTMLElement; shadow: ShadowRoot };
  api: Api; auth: Auth; live: LiveAdapter; me: Profile; project: Project; onClose(): void;
}

/** Collega barra, pin, composer e realtime per una pagina dello stage. */
export function createSession(ctx: SessionCtx) {
  const { win, root, project } = ctx;
  const state = { viewport: classifyViewport(win.innerWidth) as ViewportClass, allViewports: false, resolved: false };
  const cleanups: (() => void)[] = [];

  const toolbar = createToolbar(root.shadow, project.name, {
    onToggleComment: () => {},
    onViewport: () => {},
    onToggleAllViewports: () => { state.allViewports = !state.allViewports; syncToolbar(); },
    onToggleResolved: () => { state.resolved = !state.resolved; syncToolbar(); },
    onOpenList: () => {},
    onOpenBoard: () => { win.open(`${CONFIG.publicBaseUrl}site.html?id=${encodeURIComponent(project.id)}`, '_blank', 'noopener'); },
    onClose: () => ctx.onClose(),
  });
  cleanups.push(() => toolbar.destroy());

  function syncToolbar() {
    toolbar.setViewport(state.viewport, win.innerWidth);
    toolbar.setToggles({ allViewports: state.allViewports, resolved: state.resolved });
  }
  const onResize = () => { state.viewport = classifyViewport(win.innerWidth); syncToolbar(); };
  win.addEventListener('resize', onResize);
  cleanups.push(() => win.removeEventListener('resize', onResize));
  syncToolbar();

  return {
    toolbar,
    destroy() { for (const c of cleanups.splice(0).reverse()) c(); },
  };
}
export type Session = ReturnType<typeof createSession>;
