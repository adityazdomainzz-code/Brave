import { useId } from "react";

export function Logo({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="var(--color-glow)" />
        </linearGradient>
      </defs>
      <rect x="1.2" y="1.2" width="29.6" height="29.6" rx="9" fill={`url(#${id})`} />
      <path
        d="M9.2 8.2h7.8c3.3 0 5.4 1.7 5.4 4.15 0 1.75-1.1 3.1-2.75 3.7 2 .55 3.25 2.1 3.25 4.15 0 2.75-2.25 4.6-5.85 4.6H9.2V8.2zm3 2.45v4.05h4.35c1.55 0 2.5-.75 2.5-2.02s-.95-2.03-2.5-2.03H12.2zm0 6.5v4.35H17c1.75 0 2.85-.85 2.85-2.18S18.75 17.15 17 17.15h-4.8z"
        fill="#07101c"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="display text-lg font-bold leading-none text-fg">BREVILO</span>
  );
}
