import type { ReactNode } from 'react';

interface SectionHeadingProps {
  id: string;
  eyebrow: string;
  title: string;
  action?: ReactNode;
}

export function SectionHeading({ id, eyebrow, title, action }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-brand uppercase">{eyebrow}</p>
        <h2 id={id} className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
