import type { SupabaseClient } from '@supabase/supabase-js';
import type { ViewportClass } from './types';

export interface PresenceState { userId: string; name: string; color: string; page_path: string; viewport_class: ViewportClass }

/** Notifica l'id di ogni segnalazione del progetto creata o modificata (risposte e allegati compresi). */
export function subscribeProject(client: SupabaseClient, projectId: string, onIssueChanged: (issueId: string) => void): () => void {
  const channel = client
    .channel(`issues:${projectId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'issues', filter: `project_id=eq.${projectId}` },
      payload => {
        const id = (payload.new as { id?: string } | null)?.id ?? (payload.old as { id?: string } | null)?.id;
        if (id) onIssueChanged(id);
      })
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

export function joinPresence(
  client: SupabaseClient, projectId: string, me: PresenceState, onSync: (others: PresenceState[]) => void,
): { update(p: Partial<PresenceState>): void; leave(): void } {
  let state = { ...me };
  let joined = false;
  const channel = client.channel(`project:${projectId}`, { config: { presence: { key: me.userId } } });
  channel
    .on('presence', { event: 'sync' }, () => {
      const all = channel.presenceState<PresenceState>();
      const others = Object.entries(all)
        .filter(([key]) => key !== me.userId)
        .map(([, metas]) => metas[0] as unknown as PresenceState)
        .filter(Boolean);
      onSync(others);
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') { joined = true; void channel.track(state); }
    });
  return {
    update(p) { state = { ...state, ...p }; if (joined) void channel.track(state); },
    leave() { void channel.untrack(); void client.removeChannel(channel); },
  };
}

/** Interfaccia del realtime usata dal tool e dalla board (sostituibile nei test). */
export interface LiveAdapter {
  subscribe(projectId: string, onIssueChanged: (issueId: string) => void): () => void;
  join(projectId: string, me: PresenceState, onSync: (others: PresenceState[]) => void): { update(p: Partial<PresenceState>): void; leave(): void };
}
export function createLive(client: SupabaseClient): LiveAdapter {
  return {
    subscribe: (projectId, cb) => subscribeProject(client, projectId, cb),
    join: (projectId, me, onSync) => joinPresence(client, projectId, me, onSync),
  };
}
