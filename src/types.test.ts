// The assertions here are checked by "npm run typecheck", not at runtime.
import { expectTypeOf, it } from "vitest";
import { useSmartLoading, type UseSmartLoadingResult } from "./index.js";

interface User {
  id: number;
}
declare const response: { json(): Promise<any> };

async function inferred() {
  const { run, runWithSignal, data } = useSmartLoading();
  expectTypeOf(await run(async () => 5)).toEqualTypeOf<number>();
  expectTypeOf(await runWithSignal(async () => "a")).toEqualTypeOf<string>();
  expectTypeOf(data).toEqualTypeOf<unknown>();
}

async function declared() {
  const { run, runWithSignal, data } = useSmartLoading<User>();
  expectTypeOf(data).toEqualTypeOf<User | null>();
  expectTypeOf(await run(async () => ({ id: 1 }))).toEqualTypeOf<User>();
  // A function typed as any must not weaken the declared type.
  expectTypeOf(await run(() => response.json())).toEqualTypeOf<User>();
  expectTypeOf(await runWithSignal(() => response.json())).toEqualTypeOf<User>();
  // @ts-expect-error the result does not match the declared type
  await run(async () => "wrong");
  // @ts-expect-error run() passes no arguments, so none can be required
  await run(async (id: number) => ({ id }));
}

// `new Promise` still takes its type from the hook, as in 0.1.x.
async function newPromise() {
  const { run, runWithSignal } = useSmartLoading<User>();
  expectTypeOf(await run(() => new Promise((resolve) => resolve({ id: 1 })))).toEqualTypeOf<User>();
  await run(() => new Promise(() => {}));
  await runWithSignal(() => new Promise(() => {}));
}

async function inferredFromAny() {
  const { run } = useSmartLoading();
  expectTypeOf(await run(() => response.json())).toEqualTypeOf<any>();
}

// Assigning to the 0.1.x function shape still works.
function oldShapes() {
  const typed: (fn: () => Promise<User>) => Promise<User> = useSmartLoading<User>().run;
  const untyped: (fn: () => Promise<unknown>) => Promise<unknown> = useSmartLoading().run;
  return [typed, untyped];
}

async function literals() {
  const { run } = useSmartLoading<{ status: "ok" | "failed" }>();
  await run(async () => ({ status: "ok" }));
}

// Optional parameters stay valid with run(), as in 0.1.x.
async function optionalParameters() {
  const { run } = useSmartLoading<string>();
  await run(async (page = 1) => String(page));
}

// Wrappers that are generic themselves must still compile.
function useWrapper<T>(): (fn: () => Promise<T>) => Promise<T> {
  const smart: UseSmartLoadingResult<T> = useSmartLoading<T>();
  return (fn) => smart.run(fn);
}

it("has type assertions", () => {
  void [inferred, declared, newPromise, inferredFromAny, oldShapes];
  void [literals, optionalParameters, useWrapper];
});
