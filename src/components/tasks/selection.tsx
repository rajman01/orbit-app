"use client";

import { createContext, useContext } from "react";

/** TASK-7: selecting several tasks in a list. Rows read this; the Tasks page provides it. */
export interface TaskSelection {
  active: boolean;
  selected: ReadonlySet<string>;
  /** Shift extends from the last row clicked. */
  toggle: (id: string, shift: boolean) => void;
  /** Shift-click outside selection mode starts it with that row. */
  start: (id: string) => void;
}

const Ctx = createContext<TaskSelection | null>(null);

export const TaskSelectionProvider = Ctx.Provider;

export function useTaskSelection(): TaskSelection | null {
  return useContext(Ctx);
}
