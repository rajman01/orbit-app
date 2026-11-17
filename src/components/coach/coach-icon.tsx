import { useId, type SVGProps } from "react";

type Props = Omit<SVGProps<SVGSVGElement>, "strokeWidth"> & {
  /** Accepted so it can stand in for a Lucide icon; the sparkle is filled, so it's ignored. */
  strokeWidth?: number | string;
  /** One colour (the text colour), for use on a coloured button. */
  mono?: boolean;
};

/**
 * The coach's own mark: a large and a small four-point sparkle in a blue, violet, pink and amber
 * gradient, so anything the coach does stands out from the rest of the (single-colour) interface.
 */
export function CoachIcon({ mono = false, strokeWidth: _s, ...props }: Props) {
  const id = `coach-${useId().replace(/:/g, "")}`;
  const fill = mono ? "currentColor" : `url(#${id})`;
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden={props["aria-label"] ? undefined : true} {...props}>
      {mono ? null : (
        <defs>
          <linearGradient id={id} x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#3B82F6" />
            <stop offset="0.38" stopColor="#8B5CF6" />
            <stop offset="0.7" stopColor="#EC4899" />
            <stop offset="1" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M10 4C10.8 9.5 13.5 12.2 19 13C13.5 13.8 10.8 16.5 10 22C9.2 16.5 6.5 13.8 1 13C6.5 12.2 9.2 9.5 10 4Z"
        fill={fill}
      />
      <path
        d="M19 1C19.3 3.4 20.6 4.7 23 5C20.6 5.3 19.3 6.6 19 9C18.7 6.6 17.4 5.3 15 5C17.4 4.7 18.7 3.4 19 1Z"
        fill={fill}
      />
    </svg>
  );
}
