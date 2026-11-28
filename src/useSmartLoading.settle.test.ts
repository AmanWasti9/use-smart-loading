import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSmartLoading } from "./useSmartLoading.js";
import { advance, deferred, track } from "./testUtils.js";

describe("every run() promise settles, even when interrupted during the minDuration wait", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  type Hook = ReturnType<
    typeof renderHook<ReturnType<typeof useSmartLoading<string>>, unknown>
  >;

  const interruptions: Array<[string, (hook: Hook) => void]> = [
    ["a second run()", (hook) => void hook.result.current.run(() => new Promise(() => {}))],
    ["reset()", (hook) => hook.result.current.reset()],
    ["unmount", (hook) => hook.unmount()],
  ];

  describe.each(interruptions)("interrupted by %s", (_name, interrupt) => {
    it.each(["resolved", "rejected"])("settles as %s with its own outcome", async (status) => {
      const hook = renderHook(() => useSmartLoading<string>({ minDuration: 500 }));
      const request = deferred<string>();
      const ownError = new Error("own error");

      let outcome!: ReturnType<typeof track>;
      act(() => {
        outcome = track(hook.result.current.run(() => request.promise));
      });
      await advance(100);
      if (status === "resolved") request.resolve("own result");
      else request.reject(ownError);
      await advance(100); // now inside the minDuration wait

      act(() => interrupt(hook));
      await advance(1000);

      expect(outcome).toEqual({
        status,
        value: status === "resolved" ? "own result" : ownError,
      });
    });
  });
});
