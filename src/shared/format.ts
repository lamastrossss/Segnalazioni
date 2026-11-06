const fmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : fmt.format(d);
}

export const STATUS_LABEL = { open: 'Aperta', in_progress: 'In lavorazione', resolved: 'Risolta' } as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** "Modificata alle 10:42" (oggi), "Modificata il 05/11 alle 10:42", con l'anno se diverso. */
export function formatEdited(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `Modificata alle ${time}`;
  const day = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}${d.getFullYear() === now.getFullYear() ? '' : `/${d.getFullYear()}`}`;
  return `Modificata il ${day} alle ${time}`;
}
