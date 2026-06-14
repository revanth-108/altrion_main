import { getCategoryAccent } from './categoryColors';

interface CategoryAuraProps {
  category?: string;
}

/**
 * Full-page radial gradient that softly tints the background based on the
 * current card's category. Sits behind the layout (-z-10) and fades color
 * smoothly when the category changes.
 */
export function CategoryAura({ category }: CategoryAuraProps) {
  const color = getCategoryAccent(category);
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 opacity-40 transition-[background] duration-700 ease-out pointer-events-none"
      style={{
        background: `radial-gradient(ellipse 70% 50% at 50% 35%, ${color}26, transparent 60%)`,
      }}
    />
  );
}
