// Tipi per i test TypeScript (l'estensione è JavaScript semplice).
export type Mode = 'toggle' | 'auto';
export type LoadResult = 'opened' | 'closed' | 'active' | 'loading';
export const BUNDLED_TOOL: string;
export interface Tab { id?: number; url?: string; windowId?: number; active?: boolean }
export function isScriptable(url: unknown): boolean;
export function originOf(url: string): string;
export function pageLoader(toolUrl: string, mode: Mode): LoadResult | Promise<'opened' | 'blocked'>;
export function isolatedToggle(mode: Mode): LoadResult | 'none';
export function prepareBundled(mode: Mode): void;
export function isActiveProbe(): boolean;
export interface Controller {
  inject(tabId: number, mode: Mode): Promise<LoadResult | 'error'>;
  isAlwaysOn(origin: string): Promise<boolean>;
  toggle(tab: Tab | undefined): Promise<LoadResult | 'error' | 'unsupported'>;
  isActive(tab: Tab | undefined): Promise<boolean>;
  setAlwaysOn(origin: string, on: boolean): Promise<void>;
  onTabUpdated(tabId: number, info: { status?: string }, tab: Tab): Promise<void>;
  capture(sender: { tab?: Tab; frameId?: number }): Promise<string | null>;
}
export function createController(chrome: unknown, opts: { toolUrl: string; now?: () => number }): Controller;
