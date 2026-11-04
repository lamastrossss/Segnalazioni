export function isNewer(a: string, b: string): boolean;
export function initPopup(doc: Document, chrome: unknown, opts: {
  toolBase: string; version: string;
  fetchVersion?: (url: string) => Promise<{ version: string }>;
  close?: () => void;
}): Promise<void>;
