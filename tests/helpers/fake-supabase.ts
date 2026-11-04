// Client Supabase finto: registra le chiamate e restituisce risposte configurate.
export interface FakeCall {
  table: string; op: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  payload?: unknown; filters: [string, string, unknown][]; single?: boolean; maybe?: boolean;
}
type Response = { data: unknown; error: unknown; status?: number };
type Handler = (call: FakeCall) => Response | Promise<Response>;

export function createFakeSupabase() {
  const calls: FakeCall[] = [];
  const uploads: { path: string; blob: Blob; contentType?: string }[] = [];
  const handlers = new Map<string, Handler>();
  let failUpload: (path: string) => boolean = () => false;
  let session: { user: { id: string; email: string } } | null = null;
  const authListeners: ((evt: string, s: unknown) => void)[] = [];

  function from(table: string) {
    const call: FakeCall = { table, op: 'select', filters: [] };
    const b = {
      select() { return b; },
      insert(p: unknown) { call.op = 'insert'; call.payload = p; return b; },
      update(p: unknown) { call.op = 'update'; call.payload = p; return b; },
      upsert(p: unknown) { call.op = 'upsert'; call.payload = p; return b; },
      delete() { call.op = 'delete'; return b; },
      eq(c: string, v: unknown) { call.filters.push(['eq', c, v]); return b; },
      is(c: string, v: unknown) { call.filters.push(['is', c, v]); return b; },
      in(c: string, v: unknown) { call.filters.push(['in', c, v]); return b; },
      order() { return b; },
      limit() { return b; },
      single() { call.single = true; return b; },
      maybeSingle() { call.maybe = true; return b; },
      then(res: (r: Response) => unknown, rej?: (e: unknown) => unknown) {
        calls.push(call);
        const h = handlers.get(`${table}:${call.op}`);
        return Promise.resolve(h ? h(call) : { data: null, error: null }).then(res, rej);
      },
    };
    return b;
  }

  const client = {
    from,
    rpc: async (fn: string) => (handlers.get(`rpc:${fn}`)?.({ table: fn, op: 'select', filters: [] }) ?? { data: null, error: null }),
    storage: {
      from: () => ({
        upload: async (path: string, blob: Blob, opts?: { contentType?: string }) => {
          if (failUpload(path)) return { data: null, error: { message: 'upload failed', statusCode: '500' } };
          uploads.push({ path, blob, contentType: opts?.contentType });
          return { data: { path }, error: null };
        },
        createSignedUrl: async (p: string, s: number) => ({ data: { signedUrl: `https://signed/${p}?t=${s}` }, error: null }),
      }),
    },
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const h = handlers.get('auth:signIn');
        const r = h ? await h({ table: 'auth', op: 'select', filters: [], payload: { email, password } }) : { data: null, error: null };
        if (!r.error) { session = { user: { id: 'u1', email } }; authListeners.forEach(l => l('SIGNED_IN', session)); }
        return { data: { session }, error: r.error };
      },
      signUp: async (args: unknown) => {
        const h = handlers.get('auth:signUp');
        return h ? h({ table: 'auth', op: 'insert', filters: [], payload: args }) : { data: {}, error: null };
      },
      onAuthStateChange: (cb: (evt: string, s: unknown) => void) => {
        authListeners.push(cb);
        return { data: { subscription: { unsubscribe: () => authListeners.splice(authListeners.indexOf(cb), 1) } } };
      },
    },
  };

  return {
    client: client as never,
    calls, uploads,
    on(key: string, h: Handler) { handlers.set(key, h); },
    failUploadWhen(f: (path: string) => boolean) { failUpload = f; },
    setSession(s: typeof session) { session = s; },
  };
}
