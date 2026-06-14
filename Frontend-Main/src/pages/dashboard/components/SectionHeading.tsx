import type { ReactNode } from 'react';

interface SectionHeadingProps {
  icon: ReactNode;
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}

export function SectionHeading({ icon, title, eyebrow, action }: SectionHeadingProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="section-heading min-w-0">
        <div className="section-heading__icon shrink-0">{icon}</div>
        <div className="min-w-0">
          {eyebrow && <span className="section-heading__eyebrow">{eyebrow}</span>}
          <h3 className="font-display text-lg sm:text-[1.35rem] font-semibold tracking-tight text-text-primary">
            {title}
          </h3>
        </div>
      </div>
      {action}
    </div>
  );
}
