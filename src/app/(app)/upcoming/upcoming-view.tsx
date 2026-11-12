"use client";

import { CalendarDays } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { UpcomingScene } from "@/components/app/scenes";
import { SectionLabel, TaskList } from "@/components/tasks/task-list";
import { useAllTasks, useSettings } from "@/features/data";
import { buildUpcoming } from "@/features/today/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel, longDayLabel } from "@/lib/dates";

/** The next 14 days, grouped by the day each task is planned for. */
export function UpcomingView() {
  const all = useAllTasks();
  const todayDay = useToday();
  const { dailyCapacityPts } = useSettings();
  const days = buildUpcoming(all ?? [], todayDay, 14);

  return (
    <>
      <PageHeader title="Upcoming" subtitle="Next 14 days" />
      <PageBody>
        {all && !days.length ? (
          <EmptyState
            icon={CalendarDays}
            illustration={<UpcomingScene />}
            title="Nothing planned ahead"
            body="Schedule tasks from their details, or move them here from Today."
          />
        ) : null}
        {days.map(({ day, tasks }) => {
          const pts = tasks.reduce((s, t) => s + (t.effort ?? 0), 0);
          const label = dayLabel(day, todayDay);
          return (
            <section key={day} aria-label={longDayLabel(day)}>
              <SectionLabel count={tasks.length}>
                {label === "Tomorrow" ? `Tomorrow · ${longDayLabel(day)}` : longDayLabel(day)}
                {pts ? (
                  <span
                    className={cn("normal-case", pts > dailyCapacityPts ? "text-warning-text" : "text-label-tertiary")}
                  >
                    · {pts} pts
                  </span>
                ) : null}
              </SectionLabel>
              <TaskList tasks={tasks} sort={false} label={longDayLabel(day)} />
            </section>
          );
        })}
      </PageBody>
    </>
  );
}
