// Chrome simulato per i test dell'estensione.
export function createFakeChrome(opts: { activeTab?: { id: number; url: string; windowId?: number }; pageResult?: unknown; captureFails?: boolean } = {}) {
  const calls: any[] = [];
  const store: Record<string, unknown> = {};
  const granted = new Set<string>();
  const badges: { tabId?: number; text: string }[] = [];
  let pageResult: unknown = opts.pageResult ?? 'opened';
  const chrome: any = {
    scripting: {
      executeScript: async (inj: any) => {
        calls.push(inj);
        if (inj.files) return [{ result: undefined }];
        if (typeof pageResult === 'function') return [{ result: (pageResult as any)(inj) }];
        // la copia interna (mondo isolato) di norma non è aperta
        if (inj.func?.name === 'isolatedToggle') return [{ result: 'none' }];
        if (inj.func?.name === 'prepareBundled') return [{ result: undefined }];
        return [{ result: pageResult }];
      },
    },
    storage: { sync: {
      get: async (k: string): Promise<Record<string, unknown>> => (k in store ? { [k]: store[k] } : {}),
      set: async (o: Record<string, unknown>) => { Object.assign(store, o); },
    } },
    permissions: {
      contains: async ({ origins }: { origins: string[] }) => origins.every(o => granted.has(o)),
      request: async ({ origins }: { origins: string[] }) => { origins.forEach(o => granted.add(o)); return true; },
      remove: async ({ origins }: { origins: string[] }) => { origins.forEach(o => granted.delete(o)); return true; },
    },
    tabs: {
      captureVisibleTab: async () => { if (opts.captureFails) throw new Error('no permission'); return 'data:img'; },
      query: async () => (opts.activeTab ? [opts.activeTab] : []),
    },
    action: { setBadgeText: async (b: { tabId?: number; text: string }) => { badges.push(b); } },
    runtime: { getManifest: () => ({ version: '1.0.0' }) },
  };
  return {
    chrome, calls, store, granted, badges,
    grant: (o: string) => granted.add(o),
    setPageResult: (r: unknown) => { pageResult = r; },
    /** Avvii del tool online (loader nel mondo MAIN). */
    injections: () => calls.filter(c => c.func?.name === 'pageLoader'),
    lastMode: () => calls.filter(c => c.func?.name === 'pageLoader').at(-1)?.args?.[1],
    /** Passi in ordine: nome del file o della funzione e mondo. */
    steps: () => calls.map(c => [c.files?.[0] ?? c.func.name, c.world ?? 'ISOLATED']),
  };
}
