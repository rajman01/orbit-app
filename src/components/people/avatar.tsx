import { areaColorVar } from "@/features/areas/model";
import { initials } from "@/features/people/model";
import { cn } from "@/lib/cn";

/** A coloured circle with the person's initials, or their emoji (no photos). */
export function PersonAvatar({
  person,
  size = 36,
  className,
}: {
  person: { name: string; emoji: string | null; color: string };
  size?: number;
  className?: string;
}) {
  const color = areaColorVar(person.color);
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold select-none", className)}
      style={{
        width: size,
        height: size,
        fontSize: person.emoji ? size * 0.5 : size * 0.38,
        background: `color-mix(in srgb, ${color} ${person.emoji ? 16 : 20}%, transparent)`,
        color,
      }}
    >
      {person.emoji || initials(person.name)}
    </span>
  );
}
