"use client";

import { Check, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OrbitMark } from "@/components/app/app-shell";
import { useCurrentUser } from "@/components/app/auth-gate";
import { AreaIcon } from "@/components/areas/area-icon";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useActions } from "@/features/actions";
import { AREA_PRESETS, presetAreaId } from "@/features/areas/model";
import { useSettings } from "@/features/data";
import { WEEKDAYS } from "@/features/settings/model";
import { cn } from "@/lib/cn";
import { deviceTimezone } from "@/lib/dates";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

const STEPS = ["Areas", "Rhythm", "First goal"] as const;

/** Onboarding (PRD ONB-2/ONB-3): areas → rhythm → a first goal with a next step. */
export function Welcome() {
  const user = useCurrentUser();
  const actions = useActions();
  const settings = useSettings();
  const router = useRouter();
  const { transition } = useOrbitMotion();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [areas, setAreas] = useState<string[]>(AREA_PRESETS.filter((a) => a.suggested).map((a) => a.slug));
  // Areas of your own, alongside the presets.
  const [custom, setCustom] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const addCustom = () => {
    const name = customName.trim();
    if (name && !custom.some((c) => c.toLowerCase() === name.toLowerCase())) setCustom([...custom, name]);
    setCustomName("");
  };
  const [weekStart, setWeekStart] = useState(String(settings.weekStartDay));
  const [cycle, setCycle] = useState(String(settings.cycleLengthDays));
  const [goal, setGoal] = useState("");
  const [goalArea, setGoalArea] = useState<string>("career");
  const [firstStep, setFirstStep] = useState("");
  const [busy, setBusy] = useState(false);

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };

  const finish = async (withGoal: boolean) => {
    setBusy(true);
    await actions.ensurePresetAreas(areas);
    const colors = ["purple", "mint", "cyan", "yellow", "brown", "indigo"] as const;
    for (const [i, name] of custom.entries()) {
      await actions.createArea({ name, color: colors[i % colors.length], order: areas.length + i });
    }
    await actions.saveSettings({
      timezone: deviceTimezone(),
      weekStartDay: Number(weekStart),
      cycleLengthDays: Number(cycle),
      onboardingCompletedAt: Date.now(),
    });
    if (withGoal && goal.trim()) {
      const areaId = areas.includes(goalArea) ? presetAreaId(user.id, goalArea) : null;
      const goalId = await actions.createGoal({ title: goal.trim(), areaId });
      if (firstStep.trim()) await actions.createTask({ title: firstStep.trim(), goalId, areaId, status: "todo" });
      router.replace(`/goal?id=${goalId}`);
    } else {
      router.replace("/today");
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg-grouped px-4 pt-[max(env(safe-area-inset-top),2.5rem)] pb-10">
      <div className="flex w-full max-w-lg flex-col">
        <div className="mb-8 flex items-center justify-between">
          <OrbitMark size={30} />
          <ol className="flex gap-1.5" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === step ? "w-6 bg-accent" : i < step ? "w-1.5 bg-accent" : "w-1.5 bg-fill-strong",
                )}
              >
                <span className="sr-only">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.section
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: 24 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 * dir }}
            transition={transition("default")}
            className="flex flex-col gap-6"
          >
            {step === 0 ? (
              <>
                <header>
                  <h1 className="text-title1">Hi {user.name.split(" ")[0]}. What do you want to grow?</h1>
                  <p className="mt-2 text-callout text-label-secondary">
                    Pick the areas of your life Orbit should organise. You can change these anytime.
                  </p>
                </header>
                <div className="grid grid-cols-2 gap-2">
                  {AREA_PRESETS.map((a) => {
                    const on = areas.includes(a.slug);
                    return (
                      <button
                        key={a.slug}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setAreas((xs) => (on ? xs.filter((x) => x !== a.slug) : [...xs, a.slug]))}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border bg-surface p-3 text-left transition-colors active:scale-[0.98]",
                          on ? "border-accent ring-1 ring-accent" : "border-separator",
                        )}
                      >
                        <AreaIcon icon={a.icon} color={a.color} className="size-5" />
                        <span className="flex-1 font-medium">{a.name}</span>
                        <span
                          className={cn(
                            "grid size-5 place-items-center rounded-full",
                            on ? "bg-accent text-on-accent" : "border border-separator",
                          )}
                        >
                          {on ? <Check className="size-3" strokeWidth={3} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-2">
                  {custom.length ? (
                    <div className="flex flex-wrap gap-2">
                      {custom.map((c) => (
                        <span
                          key={c}
                          className="flex h-8 items-center gap-1.5 rounded-full bg-accent-fill pr-1 pl-3 text-callout font-medium text-accent-text"
                        >
                          {c}
                          <button
                            type="button"
                            aria-label={`Remove ${c}`}
                            onClick={() => setCustom(custom.filter((x) => x !== c))}
                            className="grid size-6 place-items-center rounded-full hover:bg-accent-fill"
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addCustom();
                    }}
                  >
                    <input
                      aria-label="Add your own area"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      maxLength={60}
                      placeholder="Add your own, e.g. Faith, Side project"
                      className="h-control min-w-0 flex-1 rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
                    />
                    <Button type="submit" variant="secondary" disabled={!customName.trim()}>
                      Add
                    </Button>
                  </form>
                </div>
                <Button size="large" disabled={!areas.length && !custom.length} onClick={() => go(1)}>
                  Continue
                </Button>
              </>
            ) : step === 1 ? (
              <>
                <header>
                  <h1 className="text-title1">Set your rhythm</h1>
                  <p className="mt-2 text-callout text-label-secondary">
                    You&rsquo;ll plan in cycles — a short stretch you commit to, then review. Two weeks starting Sunday
                    works well for most people.
                  </p>
                </header>
                <div className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-1">
                  <div className="flex flex-col gap-2">
                    <span className="text-footnote font-medium text-label-secondary">Week starts on</span>
                    <Segmented
                      label="Week starts on"
                      value={weekStart}
                      onChange={setWeekStart}
                      options={[
                        { value: "0", label: "Sunday" },
                        { value: "1", label: "Monday" },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-footnote font-medium text-label-secondary">Cycle length</span>
                    <Segmented
                      label="Cycle length"
                      value={cycle}
                      onChange={setCycle}
                      options={[
                        { value: "7", label: "1 week" },
                        { value: "14", label: "2 weeks" },
                        { value: "21", label: "3 weeks" },
                      ]}
                    />
                  </div>
                  <p className="text-footnote text-label-secondary">
                    Time zone: {deviceTimezone()} · Reviews happen on {WEEKDAYS[Number(weekStart)]}s.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="large" onClick={() => go(0)}>
                    Back
                  </Button>
                  <Button size="large" className="flex-1" onClick={() => go(2)}>
                    Continue
                  </Button>
                </div>
              </>
            ) : (
              <>
                <header>
                  <h1 className="text-title1">One goal to start</h1>
                  <p className="mt-2 text-callout text-label-secondary">
                    Something you&rsquo;ve been putting off. Give it a first step small enough to start today.
                  </p>
                </header>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void finish(true);
                  }}
                  className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-1"
                >
                  <Field label="Goal">
                    <Input
                      autoFocus
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="Land a senior role"
                    />
                  </Field>
                  <div className="flex flex-wrap gap-1.5">
                    {AREA_PRESETS.filter((a) => areas.includes(a.slug)).map((a) => (
                      <button
                        key={a.slug}
                        type="button"
                        aria-pressed={goalArea === a.slug}
                        onClick={() => setGoalArea(a.slug)}
                        className={cn(
                          "flex h-8 items-center gap-1.5 rounded-full px-3 text-footnote font-medium",
                          goalArea === a.slug ? "bg-accent-fill text-accent-text" : "bg-fill text-label-secondary",
                        )}
                      >
                        <AreaIcon icon={a.icon} color={a.color} className="size-3.5" /> {a.name}
                      </button>
                    ))}
                  </div>
                  <Field label="First step">
                    <Input
                      value={firstStep}
                      onChange={(e) => setFirstStep(e.target.value)}
                      placeholder="Open my CV and update the summary"
                    />
                  </Field>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" variant="secondary" size="large" onClick={() => go(1)}>
                      Back
                    </Button>
                    <Button type="submit" size="large" className="flex-1" loading={busy} disabled={!goal.trim()}>
                      Start
                    </Button>
                  </div>
                </form>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void finish(false)}
                  className="self-center text-subhead font-medium text-label-secondary"
                >
                  Skip for now
                </button>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </div>
    </main>
  );
}
