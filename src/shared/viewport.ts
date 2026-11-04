import type { ViewportClass } from './types';

export function classifyViewport(width: number): ViewportClass {
  if (width < 768) return 'mobile';
  if (width < 1280) return 'tablet';
  return 'desktop';
}

export const VIEWPORT_LABEL: Record<ViewportClass, 'Mobile' | 'Tablet' | 'Desktop'> = {
  mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop',
};

export const VIEWPORT_PRESETS: { id: ViewportClass; label: 'Mobile' | 'Tablet' | 'Desktop'; width: number; height: number }[] = [
  { id: 'mobile', label: 'Mobile', width: 375, height: 812 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024 },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
];
