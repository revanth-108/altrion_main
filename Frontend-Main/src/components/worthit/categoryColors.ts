export const CATEGORY_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Transport: { bg: 'bg-teal-500/10 border-teal-500/20', text: 'text-teal-300', dot: 'bg-teal-400' },
  Entertainment: { bg: 'bg-purple-500/10 border-purple-500/20', text: 'text-purple-300', dot: 'bg-purple-400' },
  'Food & Drink': { bg: 'bg-orange-500/10 border-orange-500/20', text: 'text-orange-300', dot: 'bg-orange-400' },
  Shopping: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-300', dot: 'bg-blue-400' },
  Health: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-300', dot: 'bg-emerald-400' },
};

export const CATEGORY_LOGO_GRADIENT: Record<string, string> = {
  Transport: 'from-teal-600 to-teal-800',
  Entertainment: 'from-purple-600 to-purple-800',
  'Food & Drink': 'from-orange-600 to-orange-800',
  Shopping: 'from-blue-600 to-blue-800',
  Health: 'from-emerald-600 to-emerald-800',
};

export const CATEGORY_ACCENT_HEX: Record<string, string> = {
  Transport: '#2dd4bf',
  Entertainment: '#c084fc',
  'Food & Drink': '#fb923c',
  Shopping: '#60a5fa',
  Health: '#34d399',
};

const FALLBACK_HEX = '#9ca3af';
const FALLBACK_STYLE = { bg: 'bg-gray-500/10 border-gray-500/20', text: 'text-gray-300', dot: 'bg-gray-400' };
const FALLBACK_GRADIENT = 'from-gray-600 to-gray-800';

export function getCategoryAccent(category: string | undefined | null): string {
  if (!category) return FALLBACK_HEX;
  return CATEGORY_ACCENT_HEX[category] ?? FALLBACK_HEX;
}

export function getCategoryStyle(category: string) {
  return CATEGORY_STYLES[category] ?? FALLBACK_STYLE;
}

export function getCategoryGradient(category: string): string {
  return CATEGORY_LOGO_GRADIENT[category] ?? FALLBACK_GRADIENT;
}
