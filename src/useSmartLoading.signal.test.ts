import { createElement, StrictMode, useEffect, useRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSmartLoading } from "./useSmartLoading.js";
import { advance, deferred, track } from "./testUtils.js";

/** A request that records its signal and, like fetch, rejects when aborted. */
function abortableRequest() {
  const request = deferred<string>();
  const seen: { signal?: AbortSignal } = {};
  const fn = (signal: AbortSignal) => {
    seen.signal = signal;
    signal.addEventListener("abort", () => request.reject(signal.reason));
    return request.promise;
  };
  return { ...request, fn, seen };
}

function setup(options = { minDuration: 500 }) {
  const hook = renderHook(() => useSmartLoading<string>(options));
  function start() {
    const request = abortableRequest();
    let outcome!: ReturnType<typeof track>;
    act(() => {
      outcome = track(hook.result.current.runWithSignal(request.fn));
    });
    return { ...request, outcome };
  }
  return { ...hook, start };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("runWithSignal()", () => {
  it("passes a live signal and applies the result like run()", async () => {
    const hook = setup();
    const request = hook.start();
    expect(request.seen.signal?.aborted).toBe(false);
    expect(hook.result.current.loading).toBe(true);

    request.resolve("a");
    await advance(500);
    expect(request.outcome).toEqual({ status: "resolved", value: "a" });
    expect(hook.result.current).toMatchObject({ loading: false, data: "a" });
  });

  it.each(["run", "runWithSignal"] as const)(
    "aborts the earlier request when %s() starts, without showing its error",
    async (method) => {
      const hook = setup();
      const older = hook.start();
      act(() => {
        void hook.result.current[method](() => new Promise<string>(() => {}));
      });
      await advance(1000);

      expect(older.seen.signal?.aborted).toBe(true);
      expect(older.outcome.status).toBe("rejected");
      expect((older.outcome.value as Error).name).toBe("AbortError");
      expect(hook.result.current).toMatchObject({ loading: true, error: null });
    }
  );

  it("aborts on reset() and stays idle", async () => {
    const hook = setup();
    const request = hook.start();
    act(() => hook.result.current.reset());
    await advance(1000);
    expect(request.seen.signal?.aborted).toBe(true);
    expect(request.outcome.status).toBe("rejected");
    expect(hook.result.current).toMatchObject({ loading: false, error: null });
  });

  it("aborts on unmount and leaves no timers", async () => {
    const hook = setup();
    const request = hook.start();
    hook.unmount();
    await advance();
    expect(request.seen.signal?.aborted).toBe(true);
    expect(request.outcome.status).toBe("rejected");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["a newer run", "reset", "unmount"])(
    "does not abort a request that already finished (%s)",
    async (later) => {
      const hook = setup();
      const request = hook.start();
      request.resolve("a");
      await advance(10); // finished, still in the minDuration wait

      act(() => {
        if (later === "reset") hook.result.current.reset();
        else if (later === "unmount") hook.unmount();
        else void hook.result.current.run(async () => "b");
      });
      await advance(1000);
      expect(request.seen.signal?.aborted).toBe(false);
      expect(request.outcome).toEqual({ status: "resolved", value: "a" });
    }
  );

  it("reports an error from the latest request", async () => {
    const hook = setup();
    const request = hook.start();
    request.reject("broken");
    await advance(500);
    expect(request.outcome).toEqual({ status: "rejected", value: "broken" });
    expect(hook.result.current.error).toBe("broken");
  });

  it("keeps the same function across renders", () => {
    const hook = setup();
    const { runWithSignal } = hook.result.current;
    hook.start();
    expect(hook.result.current.runWithSignal).toBe(runWithSignal);
  });

  // StrictMode's simulated unmount must not cancel a live component's request.
  it("does not abort a request started once on mount in StrictMode", async () => {
    const request = abortableRequest();
    const { result } = renderHook(
      () => {
        const smart = useSmartLoading<string>({ minDuration: 0 });
        const started = useRef(false);
        useEffect(() => {
          if (started.current) return;
          started.current = true;
          void smart.runWithSignal(request.fn);
        }, [smart.runWithSignal]);
        return smart;
      },
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(StrictMode, null, children),
      }
    );
    await advance();
    expect(request.seen.signal?.aborted).toBe(false);
    request.resolve("a");
    await advance();
    expect(result.current.data).toBe("a");
  });
});

describe("run() is unchanged", () => {
  it("still calls the function with no arguments", async () => {
    const hook = setup();
    const fn = vi.fn(async (page = 1) => `page ${page}`);
    act(() => void hook.result.current.run(fn));
    await advance(500);
    expect(fn.mock.calls).toEqual([[]]);
    expect(hook.result.current.data).toBe("page 1");
  });
});
