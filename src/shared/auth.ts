import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from './types';
import { classifyError, fail, ok, type Result } from './errors';

export function isStudioEmail(email: string): boolean {
  return /@thewavestudio\.it$/i.test(email.trim());
}

const MIN_PASSWORD = 8;

export function createAuth(client: SupabaseClient) {
  async function profileFor(userId: string, email: string): Promise<Profile> {
    const { data } = await client.from('profiles').select('id, name, color').eq('id', userId).maybeSingle();
    return (data as Profile | null) ?? { id: userId, name: email.split('@')[0], color: '#888888' };
  }

  return {
    async current(): Promise<Profile | null> {
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      return user ? profileFor(user.id, user.email ?? '') : null;
    },

    async signIn(email: string, password: string): Promise<Result<Profile>> {
      try {
        const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          if (/Invalid login credentials/i.test(error.message)) return fail('auth', 'Email o password non corretti.');
          if (/Email not confirmed/i.test(error.message)) return fail('auth', 'Conferma prima l’email: controlla la posta.');
          return { ok: false, error: await classifyError(error) };
        }
        const user = data.session!.user;
        return ok(await profileFor(user.id, user.email ?? email));
      } catch (e) {
        return { ok: false, error: await classifyError(e) };
      }
    },

    /** Cambio password dell'utente collegato (gli account li crea l'amministratore con una password provvisoria). */
    async changePassword(password: string, confirm: string): Promise<Result<void>> {
      if (password.length < MIN_PASSWORD) return fail('unknown', `La password deve avere almeno ${MIN_PASSWORD} caratteri.`);
      if (password !== confirm) return fail('unknown', 'Le due password non coincidono.');
      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) {
          if (/different from the old password/i.test(error.message)) return fail('unknown', 'La nuova password deve essere diversa da quella attuale.');
          return { ok: false, error: await classifyError(error) };
        }
        return ok(undefined);
      } catch (e) {
        return { ok: false, error: await classifyError(e) };
      }
    },

    onChange(cb: (p: Profile | null) => void): () => void {
      const { data } = client.auth.onAuthStateChange((_evt, session) => {
        const user = session?.user;
        if (user) void profileFor(user.id, user.email ?? '').then(cb);
        else cb(null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
export type Auth = ReturnType<typeof createAuth>;
