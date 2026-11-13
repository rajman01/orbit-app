"use client";

import { Command } from "cmdk";
import {
  BarChart3,
  CalendarDays,
  CalendarSync,
  Inbox,
  LayoutList,
  Moon,
  Plus,
  Repeat,
  Settings,
  Shapes,
  Sun,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AreaIcon } from "@/components/areas/area-icon";
import { StatusIcon } from "@/components/tasks/icons";
import { useTaskPanel } from "@/components/tasks/task-panel";
import { Kbd } from "@/components/ui/pill";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useAllTasks, useAreas, useGoals, useSettings } from "@/features/data";
import { parseQuickAdd, type QuickAddToken } from "@/features/quick-add/parse";
import { isOpen, taskCode, type TaskFields } from "@/features/tasks/model";
import { cn } from "@/lib/cn";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";
import { useIsDesktop } from "@/lib/use-media-query";

type QuickAddDefaults = Partial<Pick<TaskFields, "areaId" | "goalId" | "milestoneId" | "status" | "dueDate">>;

interface CommandsContext {
  openQuickAdd: (defaults?: QuickAddDefaults) => void;
  openPalette: () => void;
  openShortcuts: () => void;
}

const Ctx = createContext<CommandsContext | null>(null);

export function useCommands(): CommandsContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCommands must be used inside <CommandsProvider>");
  return c;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

const GO: Record<string, string> = {
  t: "/today",
  u: "/upcoming",
  i: "/inbox",
  k: "/tasks",
  g: "/goals",
  a: "/areas",
  s: "/settings",
  c: "/cycle",
  h: "/habits",
  r: "/report",
  l: "/levels",
};

/** Quick Add, ⌘K palette and Linear-style keyboard shortcuts (PRD CMD-1 – CMD-3, INB-1). */
export function CommandsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [quickAdd, setQuickAdd] = useState<QuickAddDefaults | null>(null);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const pendingG = useRef<number | null>(null);

  const value = useMemo<CommandsContext>(
    () => ({
      openQuickAdd: (d = {}) => setQuickAdd(d),
      openPalette: () => setPalette(true),
      openShortcuts: () => setShortcuts(true),
    }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      const key = e.key.toLowerCase();

      if (pendingG.current) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        if (GO[key]) {
          e.preventDefault();
          router.push(GO[key]);
        }
        return;
      }
      if (key === "g") {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200);
        return;
      }
      if (key === "c") {
        e.preventDefault();
        setQuickAdd({});
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcuts(true);
      } else if (key === "j" || key === "k") {
        const rows = [...document.querySelectorAll<HTMLElement>("[data-task-row]")];
        if (!rows.length) return;
        e.preventDefault();
        const i = rows.indexOf(document.activeElement as HTMLElement);
        const next = key === "j" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
        rows[i === -1 ? 0 : next].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <QuickAdd defaults={quickAdd} onClose={() => setQuickAdd(null)} />
      <Palette
        open={palette}
        onOpenChange={setPalette}
        onQuickAdd={() => setQuickAdd({})}
        onShortcuts={() => setShortcuts(true)}
      />
      <ShortcutsHelp open={shortcuts} onOpenChange={setShortcuts} />
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------- Quick Add

function QuickAdd({ defaults, onClose }: { defaults: QuickAddDefaults | null; onClose: () => void }) {
  const isDesktop = useIsDesktop();
  const open = defaults !== null;
  if (isDesktop) {
    return (
      <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
        <AnimatePresence>
          {open ? (
            <D.Portal forceMount>
              <D.Content asChild forceMount aria-describedby={undefined}>
                <QuickAddPanel key="qa" defaults={defaults} onClose={onClose} floating />
              </D.Content>
            </D.Portal>
          ) : null}
        </AnimatePresence>
      </D.Root>
    );
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="New task" hideHeader>
      {open ? <QuickAddPanel defaults={defaults} onClose={onClose} /> : null}
    </Sheet>
  );
}

const TOKEN_TONE: Record<QuickAddToken["kind"], string> = {
  date: "bg-[color-mix(in_srgb,var(--info)_14%,transparent)] text-[var(--info)]",
  priority: "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger-text",
  area: "bg-fill text-label",
  goal: "bg-accent-fill text-accent-text",
};

function QuickAddPanel({
  defaults,
  onClose,
  floating,
  ...rest
}: {
  defaults: QuickAddDefaults;
  onClose: () => void;
  floating?: boolean;
}) {
  const actions = useActions();
  const toast = useToast();
  const { timezone } = useSettings();
  const areasRaw = useAreas();
  const goalsRaw = useGoals();
  const areas = useMemo(() => areasRaw ?? [], [areasRaw]);
  const goals = useMemo(
    () => (goalsRaw ?? []).filter((g) => g.status === "active" || g.status === "planned"),
    [goalsRaw],
  );
  const { transition } = useOrbitMotion();
  const [text, setText] = useState("");
  const [count, setCount] = useState(0);
  const parsed = useMemo(() => parseQuickAdd(text, { areas, goals, timezone }), [text, areas, goals, timezone]);

  const save = async (keepOpen: boolean) => {
    if (!parsed.title) return;
    const goal = goals.find((g) => g.id === (parsed.goalId ?? defaults.goalId));
    const areaId = parsed.areaId ?? defaults.areaId ?? goal?.areaId ?? null;
    const goalId = parsed.goalId ?? defaults.goalId ?? null;
    const dueDate = parsed.dueDate ?? defaults.dueDate ?? null;
    const triaged = Boolean(areaId || goalId || dueDate);
    await actions.createTask({
      title: parsed.title,
      priority: parsed.priority ?? "none",
      areaId,
      goalId,
      milestoneId: parsed.goalId ? null : (defaults.milestoneId ?? null),
      dueDate,
      status: defaults.status ?? (triaged ? "todo" : "inbox"),
    });
    setText("");
    setCount((c) => c + 1);
    if (!keepOpen) {
      onClose();
      toast({ message: triaged ? "Task added" : "Added to Inbox" });
    }
  };

  const body = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(!(e.nativeEvent as SubmitEvent & { metaKey?: boolean }).metaKey);
      }}
      className="flex flex-col gap-3"
    >
      <D.Title className="sr-only">New task</D.Title>
      <input
        autoFocus
        aria-label="New task"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save(false);
          }
          if (e.key === "Escape") onClose();
        }}
        placeholder="Send CV tomorrow !2 #career +role"
        enterKeyHint="done"
        className="h-12 w-full bg-transparent text-title3 font-normal outline-none placeholder:text-label-tertiary"
      />
      <div className="flex min-h-6 flex-wrap items-center gap-1.5">
        {parsed.tokens.map((t) => (
          <span
            key={t.kind}
            className={cn("inline-flex h-6 items-center gap-1 rounded-sm px-2 text-caption", TOKEN_TONE[t.kind])}
          >
            {t.kind === "area" ? (
              <AreaIcon
                icon={areas.find((a) => a.name === t.label)?.icon}
                color={areas.find((a) => a.name === t.label)?.color}
                className="size-3"
              />
            ) : null}
            {t.kind === "goal" ? <Target className="size-3" /> : null}
            {t.label}
            <button
              type="button"
              aria-label={`Remove ${t.label}`}
              onClick={() => setText((v) => v.replace(t.text, "").replace(/\s+/g, " ").trim())}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {!parsed.tokens.length ? (
          <span className="text-footnote text-label-tertiary">
            Try <Kbd>tomorrow</Kbd> <Kbd>!1</Kbd> <Kbd>#area</Kbd> <Kbd>+goal</Kbd>
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between border-t border-separator pt-3 text-footnote text-label-secondary">
        <span>{count ? `${count} added · ` : ""}Enter adds another · ⌘Enter adds and closes</span>
        <button
          type="submit"
          disabled={!parsed.title}
          className="h-8 rounded-full bg-accent px-4 font-semibold text-on-accent disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </form>
  );

  if (!floating) return <div className="pb-2">{body}</div>;
  return (
    <motion.div
      {...rest}
      className="fixed top-[18%] left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] rounded-xl p-4 shadow-3 material-popover outline-none"
      style={{ x: "-50%" }}
      initial={{ opacity: 0, scale: 0.98, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -6 }}
      transition={transition("snappy")}
    >
      {body}
    </motion.div>
  );
}

// ---------------------------------------------------------------- ⌘K palette

function Palette({
  open,
  onOpenChange,
  onQuickAdd,
  onShortcuts,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onQuickAdd: () => void;
  onShortcuts: () => void;
}) {
  const router = useRouter();
  const panel = useTaskPanel();
  const { resolvedTheme, setTheme } = useTheme();
  const areas = useAreas() ?? [];
  const goals = useGoals() ?? [];
  const tasks = (useAllTasks() ?? []).filter((t) => !t.parentTaskId && isOpen(t)).slice(0, 300);
  const { transition } = useOrbitMotion();

  const run = useCallback(
    (fn: () => void) => {
      onOpenChange(false);
      fn();
    },
    [onOpenChange],
  );
  const go = (href: string) => run(() => router.push(href));

  const item =
    "flex h-11 cursor-default items-center gap-2.5 rounded-md px-2.5 text-body outline-none select-none data-[selected=true]:bg-fill lg:h-9";
  const group =
    "px-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:text-label-tertiary [&_[cmdk-group-heading]]:uppercase";

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-[var(--scrim)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition("snappy")}
              />
            </D.Overlay>
            <D.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed top-[12%] left-1/2 z-50 w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-xl shadow-3 material-popover outline-none"
                style={{ x: "-50%" }}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={transition("snappy")}
              >
                <D.Title className="sr-only">Command palette</D.Title>
                <Command loop label="Command palette">
                  <Command.Input
                    autoFocus
                    placeholder="Search or type a command…"
                    className="h-14 w-full border-b border-separator bg-transparent px-4 text-title3 font-normal outline-none placeholder:text-label-tertiary"
                  />
                  <Command.List className="max-h-[min(420px,60dvh)] overflow-y-auto pb-2">
                    <Command.Empty className="px-4 py-6 text-center text-subhead text-label-secondary">
                      Nothing found.
                    </Command.Empty>
                    <Command.Group heading="Actions" className={group}>
                      <Command.Item className={item} onSelect={() => run(onQuickAdd)}>
                        <Plus className="size-4 text-label-secondary" /> <span className="flex-1">New task</span>{" "}
                        <Kbd>C</Kbd>
                      </Command.Item>
                      <Command.Item className={item} onSelect={() => go("/goals?new=1")}>
                        <Target className="size-4 text-label-secondary" /> <span className="flex-1">New goal</span>
                      </Command.Item>
                      <Command.Item
                        className={item}
                        onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
                      >
                        {resolvedTheme === "dark" ? (
                          <Sun className="size-4 text-label-secondary" />
                        ) : (
                          <Moon className="size-4 text-label-secondary" />
                        )}
                        <span className="flex-1">Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode</span>
                      </Command.Item>
                      <Command.Item className={item} onSelect={() => run(onShortcuts)}>
                        <span className="w-4 text-center text-label-secondary">?</span>{" "}
                        <span className="flex-1">Keyboard shortcuts</span> <Kbd>?</Kbd>
                      </Command.Item>
                    </Command.Group>
                    <Command.Group heading="Go to" className={group}>
                      {[
                        ["Today", "/today", Sun, "G T"],
                        ["Upcoming", "/upcoming", CalendarDays, "G U"],
                        ["Habits", "/habits", Repeat, "G H"],
                        ["Weekly report", "/report", BarChart3, "G R"],
                        ["Levels", "/levels", Trophy, "G L"],
                        ["Inbox", "/inbox", Inbox, "G I"],
                        ["Tasks", "/tasks", LayoutList, "G K"],
                        ["Goals", "/goals", Target, "G G"],
                        ["Areas", "/areas", Shapes, "G A"],
                        ["Cycle", "/cycle", CalendarSync, "G C"],
                        ["Settings", "/settings", Settings, "G S"],
                      ].map(([label, href, Icon, keys]) => {
                        const I = Icon as typeof Sun;
                        return (
                          <Command.Item
                            key={href as string}
                            value={`go ${label}`}
                            className={item}
                            onSelect={() => go(href as string)}
                          >
                            <I className="size-4 text-label-secondary" strokeWidth={1.75} />{" "}
                            <span className="flex-1">{label as string}</span>
                            <span className="text-caption text-label-tertiary">{keys as string}</span>
                          </Command.Item>
                        );
                      })}
                      {areas.map((a) => (
                        <Command.Item
                          key={a.id}
                          value={`area ${a.name}`}
                          className={item}
                          onSelect={() => go(`/area?id=${a.id}`)}
                        >
                          <AreaIcon icon={a.icon} color={a.color} /> <span className="flex-1">{a.name}</span>
                          <span className="text-caption text-label-tertiary">Area</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                    {goals.length ? (
                      <Command.Group heading="Goals" className={group}>
                        {goals.map((g) => (
                          <Command.Item
                            key={g.id}
                            value={`goal ${g.title} ${g.id}`}
                            className={item}
                            onSelect={() => go(`/goal?id=${g.id}`)}
                          >
                            <Target className="size-4 text-label-secondary" strokeWidth={1.75} />{" "}
                            <span className="flex-1 truncate">{g.title}</span>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    ) : null}
                    {tasks.length ? (
                      <Command.Group heading="Tasks" className={group}>
                        {tasks.map((t) => (
                          <Command.Item
                            key={t.id}
                            value={`task ${t.title} ${taskCode(t) ?? ""} ${t.id}`}
                            className={item}
                            onSelect={() => run(() => panel.open(t.id))}
                          >
                            <StatusIcon status={t.status} /> <span className="flex-1 truncate">{t.title}</span>
                            <span className="font-mono text-caption text-label-tertiary">{taskCode(t)}</span>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    ) : null}
                  </Command.List>
                </Command>
              </motion.div>
            </D.Content>
          </D.Portal>
        ) : null}
      </AnimatePresence>
    </D.Root>
  );
}

// ---------------------------------------------------------------- ? cheat sheet

const SHORTCUTS: [string, string[]][] = [
  ["Command palette", ["⌘", "K"]],
  ["New task", ["C"]],
  ["Go to Today", ["G", "T"]],
  ["Go to Upcoming", ["G", "U"]],
  ["Go to Habits", ["G", "H"]],
  ["Go to Weekly report", ["G", "R"]],
  ["Go to Levels", ["G", "L"]],
  ["Go to Inbox", ["G", "I"]],
  ["Go to Tasks", ["G", "K"]],
  ["Go to Goals", ["G", "G"]],
  ["Go to Areas", ["G", "A"]],
  ["Go to Settings", ["G", "S"]],
  ["Next / previous task", ["J", "K"]],
  ["Open task", ["Enter"]],
  ["Complete task", ["⌘", "Enter"]],
  ["Start focus on task", ["F"]],
  ["Move task (skip)", ["S"]],
  ["Delete task", ["⌫"]],
  ["Close panel", ["Esc"]],
  ["This list", ["?"]],
];

function ShortcutsHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)]" />
        <D.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 max-h-[80dvh] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-surface-raised p-6 shadow-3 outline-none"
        >
          <D.Title className="text-title3">Keyboard shortcuts</D.Title>
          <ul className="mt-4 flex flex-col gap-2">
            {SHORTCUTS.map(([label, keys]) => (
              <li key={label} className="flex items-center justify-between text-callout">
                {label}
                <span className="flex gap-1">
                  {keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
