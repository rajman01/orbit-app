import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** True after hydration. Use for UI that depends on browser-only state (e.g. the stored theme). */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
