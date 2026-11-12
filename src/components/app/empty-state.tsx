import type { LucideIcon } from "lucide-react";

/** DESIGN.md §11.17 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  illustration,
}: {
  /** A small scene shown instead of the icon. */
  illustration?: React.ReactNode;
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      {illustration ? (
        <div className="mb-4 w-56 max-w-full">{illustration}</div>
      ) : (
        <Icon className="mb-4 size-8 text-label-tertiary" strokeWidth={1.5} aria-hidden />
      )}
      <h2 className="text-title3">{title}</h2>
      <p className="mt-1 max-w-sm text-subhead text-label-secondary">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
