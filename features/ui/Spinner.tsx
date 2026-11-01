// A small loading spinner (S10-06). Decorative by default: pair it with
// visible text such as "Checking…", or give it a label.
export function Spinner({ className = "h-4 w-4", label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* v1.42.0 brand: a light track and a turning arc in the text colour. */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// A grey placeholder block for loading.tsx skeletons.
export function SkeletonBlock({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} style={style} />;
}
