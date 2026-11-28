// <Activity> (React 19.2+) cleans up a hidden component's effects but keeps its
// state, then runs the effects again when it is shown. Skipped on older React.
import * as ReactModule from "react";
import { createElement, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useSmartLoading } from "./useSmartLoading.js";
import { advance, deferred, track } from "./testUtils.js";

const Activity = (ReactModule as unknown as { Activity?: ComponentType<any> }).Activity;

function setup() {
  const hook = {} as { api: ReturnType<typeof useSmartLoading<string>> };
  function Probe() {
    hook.api = useSmartLoading<string>({ delay: 100, minDuration: 500 });
    return null;
  }
  const tree = (mode: "visible" | "hidden") =>
    createElement(Activity!, { mode }, createElement(Probe));
  const view = render(tree("visible"));
  return {
    hook,
    hide: () => view.rerender(tree("hidden")),
    show: () => view.rerender(tree("visible")),
  };
}

describe.skipIf(!Activity)("hidden and shown again with <Activity>", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each(["during the request", "during the minDuration wait"])(
    "keeps the result of a run() hidden %s",
    async (when) => {
      const { hook, hide, show } = setup();
      const request = deferred<string>();
      act(() => void hook.api.run(() => request.promise));
      await advance(150);

      if (when === "during the request") {
        hide();
        request.resolve("a");
      } else {
        request.resolve("a");
        await advance(10);
        hide();
      }
      await advance();
      show();
      await advance();

      expect(hook.api).toMatchObject({ loading: false, isPending: false, data: "a" });
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("shows no error for a runWithSignal() request that hiding aborted", async () => {
    const { hook, hide, show } = setup();
    let outcome!: ReturnType<typeof track>;
    act(() => {
      outcome = track(
        hook.api.runWithSignal(
          (signal) =>
            new Promise<string>((_, reject) =>
              signal.addEventListener("abort", () => reject(signal.reason))
            )
        )
      );
    });
    await advance(150);

    hide();
    await advance();
    show();
    await advance(1000);

    expect(outcome.status).toBe("rejected");
    expect(hook.api).toMatchObject({ loading: false, isPending: false, error: null });
    expect(vi.getTimerCount()).toBe(0);
  });
});
