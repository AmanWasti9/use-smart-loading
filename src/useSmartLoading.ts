// A default import, because Node cannot see React 16's hooks as named exports.
import React from "react";

const { useCallback, useEffect, useRef, useState } = React;

export interface SmartLoadingOptions {
  /** Minimum time in ms the loader stays visible once shown. Default: 500. */
  minDuration?: number;
  /** Time in ms to wait before showing the loader. Default: 0 (show at once). */
  delay?: number;
}

interface SmartLoadingState<T> {
  /** Whether to show the loader. */
  loading: boolean;
  /** True from run() until the latest run has finished and the loader is done. */
  isPending: boolean;
  /** Result of the latest successful run. */
  data: T | null;
  /** Error from the latest run, if it failed. */
  error: unknown;
}

// With no type argument on the hook (T is unknown), each call returns the type
// of its own function. With one, calls return T, even if the function is
// typed as returning any.
type RunResult<T, R> = Promise<unknown extends T ? R : T>;
// Including T lets TypeScript infer inside `new Promise(...)` as before.
type RunInput<T, R> = Promise<R | (unknown extends T ? never : T)>;

export interface UseSmartLoadingResult<T> extends SmartLoadingState<T> {
  /** Calls your function. Resolves or rejects with that call's own outcome. */
  run: <R extends T = T>(asyncFn: () => RunInput<T, R>) => RunResult<T, R>;
  /** Like run(), and aborts the signal if the request is no longer needed. */
  runWithSignal: <R extends T = T>(
    asyncFn: (signal: AbortSignal) => RunInput<T, R>
  ) => RunResult<T, R>;
  /** Clears the state and ignores the results of earlier runs. */
  reset: () => void;
}

const initialState: SmartLoadingState<never> = {
  loading: false,
  isPending: false,
  data: null,
  error: null,
};

export function useSmartLoading<T = unknown>(
  options: SmartLoadingOptions = {}
): UseSmartLoadingResult<T> {
  const { minDuration = 500, delay = 0 } = options;

  const [state, setState] = useState<SmartLoadingState<T>>(initialState);

  // The ref is the source of truth. React state mirrors it only while mounted.
  const stateRef = useRef(state);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  // The delayed loader: when it is due (null if none is pending) and its timer.
  const loaderDueRef = useRef<number | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const shownAtRef = useRef(0);

  // Ends the current minDuration wait early, so its run() promise can settle.
  const releaseHoldRef = useRef<(() => void) | null>(null);

  // Set only while a runWithSignal() request is still in flight.
  const controllerRef = useRef<AbortController | null>(null);

  const abortRequest = useCallback((next: AbortController | null = null) => {
    const previous = controllerRef.current;
    controllerRef.current = next;
    previous?.abort();
  }, []);

  const commit = useCallback((patch: Partial<SmartLoadingState<T>>) => {
    const previous = stateRef.current;
    const changed = (Object.keys(patch) as Array<keyof typeof patch>).some(
      (key) => !Object.is(previous[key], patch[key])
    );
    if (!changed) return;

    stateRef.current = { ...previous, ...patch };
    if (mountedRef.current) setState(stateRef.current);
  }, []);

  const cancelDelayedLoader = useCallback(() => {
    clearTimeout(delayTimerRef.current);
    loaderDueRef.current = null;
  }, []);

  const showLoader = useCallback(
    (patch: Partial<SmartLoadingState<T>> = {}) => {
      cancelDelayedLoader();
      if (!stateRef.current.loading) shownAtRef.current = Date.now();
      commit({ ...patch, loading: true });
    },
    [cancelDelayedLoader, commit]
  );

  const startDelayTimer = useCallback(
    (ms: number) => {
      delayTimerRef.current = setTimeout(() => showLoader(), ms);
    },
    [showLoader]
  );

  useEffect(() => {
    mountedRef.current = true;

    // React can clean up effects and run them again on a live component
    // (StrictMode, for example), so restore what the cleanup interrupted.
    setState(stateRef.current);
    if (loaderDueRef.current !== null) {
      startDelayTimer(Math.max(loaderDueRef.current - Date.now(), 0));
    }

    return () => {
      mountedRef.current = false;
      clearTimeout(delayTimerRef.current);
      releaseHoldRef.current?.();

      // Wait a microtask: if React runs the effect again right away
      // (StrictMode), the component is still live and nothing is aborted.
      void Promise.resolve().then(() => {
        if (mountedRef.current || !controllerRef.current) return;

        // The run is stale from here on, so the abort is not reported as an
        // error if the component is shown again (<Activity>, for example).
        requestIdRef.current++;
        cancelDelayedLoader();
        commit({ loading: false, isPending: false });
        abortRequest();
      });
    };
  }, [startDelayTimer, cancelDelayedLoader, commit, abortRequest]);

  const execute = useCallback(
    async (
      asyncFn: () => Promise<T>,
      controller: AbortController | null
    ): Promise<T> => {
      const id = ++requestIdRef.current;
      const startedAt = Date.now();
      releaseHoldRef.current?.();
      abortRequest(controller);

      if (delay > 0 && !stateRef.current.loading) {
        commit({ isPending: true, error: null });
        // A delay that is already counting down is not restarted.
        if (loaderDueRef.current === null) {
          loaderDueRef.current = startedAt + delay;
          if (mountedRef.current) startDelayTimer(delay);
        }
      } else {
        showLoader({ isPending: true, error: null });
      }

      // Waits out minDuration if needed, then applies the outcome, unless
      // a newer run() or reset() has made this run stale.
      const finish = async (outcome: Partial<SmartLoadingState<T>>) => {
        if (requestIdRef.current !== id) return;

        if (mountedRef.current && stateRef.current.loading) {
          // With a delay, minDuration counts from when the loader appeared.
          // Without one, it counts from this run() call, as in 0.1.x.
          const since = delay > 0 ? shownAtRef.current : startedAt;
          const remaining = minDuration - (Date.now() - since);

          if (remaining > 0) {
            await new Promise<void>((resolve) => {
              const release = () => {
                clearTimeout(timer);
                releaseHoldRef.current = null;
                resolve();
              };
              const timer = setTimeout(release, remaining);
              releaseHoldRef.current = release;
            });
            if (requestIdRef.current !== id) return;
          }
        }

        cancelDelayedLoader();
        commit({ ...outcome, loading: false, isPending: false });
      };

      // A finished request must not be aborted later: its signal may still
      // control something the caller is using, such as a response body.
      const forgetController = () => {
        if (controllerRef.current === controller) controllerRef.current = null;
      };

      let result: T;
      try {
        result = await asyncFn();
      } catch (err) {
        forgetController();
        await finish({ error: err });
        throw err;
      }
      forgetController();
      await finish({ data: result });
      return result;
    },
    [
      minDuration,
      delay,
      commit,
      showLoader,
      startDelayTimer,
      cancelDelayedLoader,
      abortRequest,
    ]
  );

  const run = useCallback(
    (asyncFn: () => Promise<T>): Promise<T> => execute(asyncFn, null),
    [execute]
  ) as UseSmartLoadingResult<T>["run"];

  const runWithSignal = useCallback(
    (asyncFn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      const controller = new AbortController();
      return execute(() => asyncFn(controller.signal), controller);
    },
    [execute]
  ) as UseSmartLoadingResult<T>["runWithSignal"];

  const reset = useCallback(() => {
    // Makes every earlier run stale.
    requestIdRef.current++;
    cancelDelayedLoader();
    releaseHoldRef.current?.();
    abortRequest();
    commit(initialState);
  }, [cancelDelayedLoader, abortRequest, commit]);

  return { ...state, run, runWithSignal, reset };
}
