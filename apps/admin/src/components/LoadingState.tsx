interface LoadingStateProps {
  label?: string;
  rows?: number;
}

/** Skeleton placeholder; announces the loading state to screen readers. */
export function LoadingState({ label = 'Wczytywanie…', rows = 6 }: LoadingStateProps) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="skeleton__row" aria-hidden="true" />
      ))}
    </div>
  );
}
