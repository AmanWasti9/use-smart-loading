import { createElement, StrictMode, useEffect, useRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useSmartLoading } from "./useSmartLoading.js";
import { advance, deferred, track } from "./testUtils.js";

type Options = Parameters<typeof useSmartLoading>[0];

/** Renders the hook and keeps every rendered snapshot, so blinks cannot hide. */
function setup(options?: Options) {
  const renders: Array<ReturnType<typeof useSmartLoading<string>>> = [];
  const hook = renderHook(() => {
    const value = useSmartLoading<string>(options);
    renders.push(value);
    return value;
  });

  function start() {
    const request = deferred<string>();
    let outcome!: ReturnType<typeof track>;
    act(() => {
      outcome = track(hook.result.current.run(() => request.promise));
    });
    return { ...request, outcome };
  }

  return {
    ...hook,
    renders,
    start,
    state() {
      const { loading, isPending, data, error } = hook.result.current;
      return { loading, isPending, data, error };
    },
    /** The sequence of distinct `loading` values that were rendered. */
    loadingHistory() {
      return renders
        .map((r) => r.loading)
        .filter((value, i, all) => i === 0 || value !== all[i - 1]);
    },
  };
}

const idle = { loading: false, isPending: false, data: null, error: null };
const busy = { ...idle, loading: true, isPending: true };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("success and error", () => {
  it("starts idle", () => {
    expect(setup().state()).toEqual(idle);
  });

  it("shows loading immediately by default and holds it for 500ms", async () => {
    const hook = setup();
    const request = hook.start();
    expect(hook.state()).toEqual(busy);

    request.resolve("a");
    await advance(499);
    expect(hook.state()).toEqual(busy);
    expect(request.outcome.status).toBe("pending");

    await advance(1);
    expect(hook.state()).toEqual({ ...idle, data: "a" });
    expect(request.outcome).toEqual({ status: "resolved", value: "a" });
  });

  it("holds errors for minDuration, then sets error and rejects", async () => {
    const hook = setup({ minDuration: 300 });
    const request = hook.start();
    const failure = new Error("boom");

    request.reject(failure);
    await advance(299);
    expect(hook.state()).toEqual(busy);

    await advance(1);
    expect(hook.state()).toEqual({ ...idle, error: failure });
    expect(request.outcome).toEqual({ status: "rejected", value: failure });
  });

  it("treats a synchronous throw like a rejection", async () => {
    const hook = setup({ minDuration: 0 });
    const failure = new Error("sync");
    let outcome!: ReturnType<typeof track>;
    act(() => {
      outcome = track(
        hook.result.current.run(() => {
          throw failure;
        })
      );
    });
    await advance();
    expect(outcome).toEqual({ status: "rejected", value: failure });
    expect(hook.state()).toEqual({ ...idle, error: failure });
  });

  it("adds no wait when the request is slower than minDuration", async () => {
    const hook = setup({ minDuration: 500 });
    const request = hook.start();
    await advance(800);
    request.resolve("slow");
    await advance();
    expect(hook.state()).toEqual({ ...idle, data: "slow" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finishes without a wait when minDuration is 0", async () => {
    const hook = setup({ minDuration: 0 });
    hook.start().resolve("a");
    await advance();
    expect(hook.state()).toEqual({ ...idle, data: "a" });
  });

  it("keeps old data and clears the old error when a new run starts", async () => {
    const hook = setup({ minDuration: 0 });
    hook.start().resolve("a");
    await advance();

    hook.start().reject("bad");
    await advance();
    expect(hook.state()).toEqual({ ...idle, data: "a", error: "bad" });

    hook.start();
    expect(hook.state()).toEqual({ ...busy, data: "a" });
  });

  it("does not re-render when reset() is called while idle", () => {
    const hook = setup();
    const renderCount = hook.renders.length;
    act(() => hook.result.current.reset());
    act(() => hook.result.current.reset());
    expect(hook.renders.length).toBe(renderCount);
  });

  it("keeps run and reset stable across renders", async () => {
    const hook = setup({ minDuration: 0, delay: 100 });
    const { run, reset } = hook.result.current;
    hook.start().resolve("a");
    await advance();
    expect(hook.result.current.run).toBe(run);
    expect(hook.result.current.reset).toBe(reset);
  });
});

describe.each([0, 200])("overlapping runs (delay: %i)", (delay) => {
  const options = { minDuration: 500, delay };

  it("ignores the older run when it finishes first", async () => {
    const hook = setup(options);
    const older = hook.start();
    const newer = hook.start();

    older.resolve("old");
    await advance(1000);
    expect(older.outcome).toEqual({ status: "resolved", value: "old" });
    expect(hook.state()).toEqual(busy);

    newer.resolve("new");
    await advance(1000);
    expect(newer.outcome).toEqual({ status: "resolved", value: "new" });
    expect(hook.state()).toEqual({ ...idle, data: "new" });
  });

  it("ignores the older run when it finishes last", async () => {
    const hook = setup(options);
    const older = hook.start();
    const newer = hook.start();

    newer.resolve("new");
    await advance(1000);
    expect(hook.state()).toEqual({ ...idle, data: "new" });

    older.resolve("old");
    await advance(1000);
    expect(older.outcome).toEqual({ status: "resolved", value: "old" });
    expect(hook.state()).toEqual({ ...idle, data: "new" });
  });

  it.each(["first", "last"])("ignores an older error arriving %s", async (order) => {
    const hook = setup(options);
    const older = hook.start();
    const newer = hook.start();

    if (order === "first") older.reject("old error");
    else newer.resolve("new");
    await advance(1000);
    if (order === "first") newer.resolve("new");
    else older.reject("old error");
    await advance(1000);

    expect(older.outcome).toEqual({ status: "rejected", value: "old error" });
    expect(hook.state()).toEqual({ ...idle, data: "new" });
  });
});

describe("a run superseded during the minDuration wait", () => {
  it("settles as soon as the new run starts and leaves no timer behind", async () => {
    const hook = setup({ minDuration: 500 });
    const older = hook.start();
    older.resolve("old");
    await advance(100);
    expect(older.outcome.status).toBe("pending");

    hook.start();
    await advance();
    expect(older.outcome).toEqual({ status: "resolved", value: "old" });
    expect(vi.getTimerCount()).toBe(0);
    expect(hook.state()).toEqual(busy);
  });
});

describe("overlapping runs with delay 0 keep the 0.1.1 timing", () => {
  it("counts minDuration from the latest run()", async () => {
    const hook = setup({ minDuration: 500 });
    hook.start();
    await advance(400);
    hook.start().resolve("new");
    await advance(499);
    expect(hook.result.current.loading).toBe(true);
    await advance(1);
    expect(hook.result.current.loading).toBe(false);
    expect(hook.loadingHistory()).toEqual([false, true, false]);
  });
});

describe.each([0, 200])("reset() and unmount (delay: %i)", (delay) => {
  const options = { minDuration: 500, delay };

  it("reset() during a request discards its result", async () => {
    const hook = setup(options);
    const request = hook.start();
    await advance(100);
    act(() => hook.result.current.reset());
    expect(hook.state()).toEqual(idle);
    expect(vi.getTimerCount()).toBe(0);

    request.resolve("late");
    await advance(1000);
    expect(request.outcome).toEqual({ status: "resolved", value: "late" });
    expect(hook.state()).toEqual(idle);
  });

  it("reset() during the minDuration wait discards the held result", async () => {
    const hook = setup(options);
    const request = hook.start();
    await advance(300); // the loader is visible for either delay
    request.resolve("held");
    await advance(10);

    act(() => hook.result.current.reset());
    await advance();
    expect(request.outcome).toEqual({ status: "resolved", value: "held" });
    expect(hook.state()).toEqual(idle);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unmount during a request leaves no timers and logs nothing", async () => {
    const consoleError = vi.spyOn(console, "error");
    const hook = setup(options);
    const request = hook.start();
    await advance(100);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);

    request.resolve("late");
    await advance();
    expect(request.outcome).toEqual({ status: "resolved", value: "late" });
    expect(vi.getTimerCount()).toBe(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("unmount during the minDuration wait settles the run and clears timers", async () => {
    const hook = setup(options);
    const request = hook.start();
    await advance(300);
    request.reject("held error");
    await advance(10);

    hook.unmount();
    await advance();
    expect(request.outcome).toEqual({ status: "rejected", value: "held error" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("run() called after unmount settles and starts no timers", async () => {
    const hook = setup(options);
    const { run } = hook.result.current;
    hook.unmount();
    const request = deferred<string>();
    const outcome = track(run(() => request.promise));
    expect(vi.getTimerCount()).toBe(0);
    request.resolve("after");
    await advance();
    expect(outcome).toEqual({ status: "resolved", value: "after" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("React StrictMode", () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(StrictMode, null, children);

  it.each([0, 200])("completes a normal run (delay: %i)", async (delay) => {
    const { result } = renderHook(() => useSmartLoading<string>({ delay }), { wrapper });
    const request = deferred<string>();
    act(() => void result.current.run(() => request.promise));
    await advance(300);
    expect(result.current.loading).toBe(true);
    request.resolve("a");
    await advance(1000);
    expect(result.current).toMatchObject({ loading: false, data: "a" });
  });

  // StrictMode runs effects, cleans them up, then runs them again. A run started
  // by a run-once mount effect must survive that cycle.
  it.each([0, 200])("keeps a run started once on mount (delay: %i)", async (delay) => {
    const request = deferred<string>();
    const { result } = renderHook(
      () => {
        const smart = useSmartLoading<string>({ delay });
        const started = useRef(false);
        useEffect(() => {
          if (started.current) return;
          started.current = true;
          void smart.run(() => request.promise);
        }, [smart.run]);
        return smart;
      },
      { wrapper }
    );

    await advance(200);
    expect(result.current.loading).toBe(true);
    request.resolve("a");
    await advance(1000);
    expect(result.current).toMatchObject({ loading: false, data: "a" });
  });

  // A child's effects run before its parent's, so on StrictMode's second pass
  // the child calls run() before the hook's own effect has run again.
  it("shows a run started by a child effect that resets on cleanup", async () => {
    function Child({ smart }: { smart: ReturnType<typeof useSmartLoading<string>> }) {
      const { run, reset } = smart;
      useEffect(() => {
        void run(() => new Promise<string>(() => {}));
        return reset;
      }, [run, reset]);
      return null;
    }
    function Parent() {
      const smart = useSmartLoading<string>();
      return createElement(
        "div",
        null,
        smart.loading ? "loading" : "idle",
        createElement(Child, { smart })
      );
    }

    const { container } = render(createElement(StrictMode, null, createElement(Parent)));
    await advance();
    expect(container.textContent).toBe("loading");
  });
});

describe("isPending", () => {
  it("matches loading when delay is 0", async () => {
    const hook = setup();
    hook.start().resolve("a");
    await advance(1000);
    expect(hook.renders.every((r) => r.isPending === r.loading)).toBe(true);
  });

  it("is true during the delay and the minDuration wait", async () => {
    const hook = setup({ delay: 200, minDuration: 500 });
    const request = hook.start();
    expect(hook.state()).toEqual({ ...idle, isPending: true });
    await advance(250);
    request.resolve("a");
    await advance(100);
    expect(hook.result.current.isPending).toBe(true);
    await advance(1000);
    expect(hook.result.current.isPending).toBe(false);
  });

  it("follows the latest run, not an older one", async () => {
    const hook = setup({ delay: 200 });
    const older = hook.start();
    const newer = hook.start();
    older.resolve("old");
    await advance(1000);
    expect(hook.result.current.isPending).toBe(true);
    newer.resolve("new");
    await advance(1000);
    expect(hook.result.current.isPending).toBe(false);
  });
});

describe("delay option", () => {
  const options = { delay: 200, minDuration: 500 };

  it.each(["resolve", "reject"] as const)(
    "never sets loading when the request %ss before the delay ends",
    async (finish) => {
      const hook = setup(options);
      const request = hook.start();

      await advance(199);
      request[finish]("quick");
      await advance();

      expect(request.outcome.status).not.toBe("pending");
      expect(hook.state()).toEqual(
        finish === "resolve" ? { ...idle, data: "quick" } : { ...idle, error: "quick" }
      );
      expect(vi.getTimerCount()).toBe(0);
      await advance(1000);
      expect(hook.loadingHistory()).toEqual([false]);
    }
  );

  it("shows the loader when the delay ends", async () => {
    const hook = setup(options);
    hook.start();
    await advance(199);
    expect(hook.result.current.loading).toBe(false);
    await advance(1);
    expect(hook.state()).toEqual(busy);
  });

  it("holds the loader for minDuration counted from when it appeared", async () => {
    const hook = setup(options);
    const request = hook.start();
    await advance(250);
    request.resolve("a");
    await advance(449); // t = 699, the loader has been visible for 499ms
    expect(hook.state()).toEqual(busy);
    expect(request.outcome.status).toBe("pending");
    await advance(1);
    expect(hook.state()).toEqual({ ...idle, data: "a" });
    expect(request.outcome.status).toBe("resolved");
  });

  it("adds no wait once the loader has been visible for minDuration", async () => {
    const hook = setup(options);
    const request = hook.start();
    await advance(900);
    request.resolve("a");
    await advance();
    expect(hook.state()).toEqual({ ...idle, data: "a" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hides the loader as soon as the request finishes when minDuration is 0", async () => {
    const hook = setup({ delay: 200, minDuration: 0 });
    const request = hook.start();
    await advance(201);
    expect(hook.result.current.loading).toBe(true);
    request.resolve("a");
    await advance();
    expect(hook.state()).toEqual({ ...idle, data: "a" });
  });

  it("keeps a visible loader up, without blinking, across a new run()", async () => {
    const hook = setup(options);
    const older = hook.start();
    await advance(250);
    older.resolve("old");
    await advance(100); // t = 350, in the minDuration wait

    const newer = hook.start();
    expect(hook.result.current.loading).toBe(true);
    await advance(50);
    newer.resolve("new");

    await advance(299); // t = 699, the loader appeared at t = 200
    expect(hook.result.current.loading).toBe(true);
    await advance(1);
    expect(hook.state()).toEqual({ ...idle, data: "new" });
    expect(hook.loadingHistory()).toEqual([false, true, false]);
  });

  it("does not restart a pending delay when run() is called again", async () => {
    const hook = setup(options);
    hook.start();
    await advance(150);
    hook.start();
    await advance(49);
    expect(hook.result.current.loading).toBe(false);
    await advance(1);
    expect(hook.result.current.loading).toBe(true);
  });

  it("shows no loader if the newest run finishes within the pending delay", async () => {
    const hook = setup(options);
    const older = hook.start();
    await advance(100);
    hook.start().resolve("new");
    await advance(1000);
    expect(hook.state()).toEqual({ ...idle, data: "new" });
    older.resolve("old");
    await advance(1000);
    expect(hook.loadingHistory()).toEqual([false]);
  });

  it("starts a fresh delay after the previous run is done", async () => {
    const hook = setup(options);
    const first = hook.start();
    await advance(900);
    first.resolve("a");
    await advance();

    hook.start();
    await advance(199);
    expect(hook.result.current.loading).toBe(false);
    await advance(1);
    expect(hook.result.current.loading).toBe(true);
  });

  it.each(["reset", "unmount"])("%s cancels a pending loader", async (action) => {
    const hook = setup(options);
    hook.start();
    await advance(100);
    act(() => {
      if (action === "reset") hook.result.current.reset();
      else hook.unmount();
    });
    expect(vi.getTimerCount()).toBe(0);
    await advance(1000);
    expect(hook.loadingHistory()).toEqual([false]);
    if (action === "reset") expect(hook.state()).toEqual(idle);
  });
});
