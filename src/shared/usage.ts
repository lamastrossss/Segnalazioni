import { CONFIG } from '../config';

export const USAGE_WARN_RATIO = 0.8;

export function usageLevel(bytes: number): { ratio: number; warn: boolean } {
  const ratio = bytes / CONFIG.storageLimitBytes;
  return { ratio, warn: ratio >= USAGE_WARN_RATIO };
}
