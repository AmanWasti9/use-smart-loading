import { act } from "@testing-library/react";
import { vi } from "vitest";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Records how a promise settles, so a test can assert that it did settle. */
export function track<T>(promise: Promise<T>) {
  const outcome: { status: string; value?: unknown } = { status: "pending" };
  promise.then(
    (value) => Object.assign(outcome, { status: "resolved", value }),
    (value) => Object.assign(outcome, { status: "rejected", value })
  );
  return outcome;
}

/** Moves the fake clock forward and flushes promises and React updates. */
export async function advance(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
