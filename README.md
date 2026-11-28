# **use-smart-loading**

![npm version](https://img.shields.io/npm/v/use-smart-loading) ![License](https://img.shields.io/npm/l/use-smart-loading)

**A React hook for async loading state, with a minimum loader duration, an optional loader delay, and protection against out-of-order results.**

---

## **Why use-smart-loading?**

A common way to handle loading looks like this:

```ts
setLoading(true);
const data = await fetchData();
setData(data);
setLoading(false);
```

Problems with this approach:
- A loader can flash for a split second when the API is fast
- An older request can finish last and overwrite newer data
- A failed request leaves `loading` stuck at `true`
- The request can finish after the component has unmounted

**use-smart-loading** handles these:

- **Latest run wins** – results and errors from older runs do not change the state
- **Minimum loader duration** – once shown, the loader stays long enough to be seen
- **Optional delay** – requests that finish within the delay never set `loading`
- **Unmount handling** – a pending loader is cancelled, and `run()` promises still settle
- **Small API** – one hook with `run` and `reset`, and no runtime dependencies

## When to use this hook

- When you want to control how long a loader stays on screen
- When the same async action can be triggered multiple times
- When you need a reusable loading pattern across components

## When NOT to use this hook

- For simple one-off effects that never re-run
- If you already use a data-fetching library like React Query or SWR
- If you need to cancel the request itself. The hook ignores stale results but does not abort your function

## Installation

```
npm install use-smart-loading
```
or
```
yarn add use-smart-loading
```

React 16.8 or later is a peer dependency. The package is published as ES modules. In Node, `require()` needs a version that can load ES modules that way (20.19+, 22.12+ or later).

## Usage

`run()` returns a promise that **rejects when your function fails**. The hook also stores the failure in `error`, but you still need to catch the rejection. Otherwise it is reported as an unhandled rejection.

```tsx
import { useSmartLoading } from "use-smart-loading";

interface User {
  id: number;
  name: string;
}

async function fetchUsers(): Promise<User[]> {
  const res = await fetch("https://jsonplaceholder.typicode.com/users");
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export function Users() {
  const { loading, isPending, data, error, run, reset } =
    useSmartLoading<User[]>({ delay: 200, minDuration: 500 });

  const loadUsers = () => {
    run(fetchUsers).catch(() => {
      // Already stored in `error`, which is rendered below.
    });
  };

  return (
    <div>
      <button onClick={loadUsers} disabled={isPending}>
        Load Users
      </button>
      <button onClick={reset}>Reset</button>

      {loading && <p>Loading...</p>}
      {error ? <p style={{ color: "red" }}>{(error as Error).message}</p> : null}
      {data && (
        <ul>
          {data.map((user) => (
            <li key={user.id}>{user.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

If you need the result directly, use `try`/`catch`:

```ts
try {
  const users = await run(fetchUsers);
  console.log(users.length);
} catch (err) {
  console.error(err);
}
```

## API

**useSmartLoading(options?)**

```ts
const { loading, isPending, data, error, run, reset } = useSmartLoading<T>({
  minDuration: 500, // default
  delay: 0,         // default
});
```

| Value | Type | Description |
|---|---|---|
| `loading` | `boolean` | Whether to show the loader. |
| `isPending` | `boolean` | `true` from the moment `run()` is called until the latest run has finished, including any `minDuration` wait. Use it to disable buttons. With `delay: 0` it matches `loading`. |
| `data` | `T \| null` | Result of the latest successful run. It is kept while a new run is in progress and when a run fails. |
| `error` | `unknown` | Error from the latest run, if it failed. Cleared when a new run starts. |
| `run(asyncFn)` | `(asyncFn: () => Promise<T>) => Promise<T>` | Calls your function. The promise resolves or rejects with that call's own result or error. |
| `reset()` | `() => void` | Sets `loading` and `isPending` to `false`, clears `data` and `error`, cancels a pending loader, and ignores the results of earlier runs. |

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `minDuration` | `number` | `500` | Minimum time (ms) the loader stays once shown. |
| `delay` | `number` | `0` | Time (ms) to wait before setting `loading` to `true`. |

## Minimum duration

With the default `delay: 0`, `loading` becomes `true` as soon as you call `run()`, even if the request is very fast.

```ts
const { loading, run } = useSmartLoading({ minDuration: 1000 });
```

If the request finishes after 100ms, the loader stays until 1000ms. If it takes 1500ms, no extra time is added. When runs overlap with `delay: 0`, `minDuration` is counted from the latest `run()` call.

## Delay

```ts
const { loading, isPending, run } = useSmartLoading({ delay: 200, minDuration: 500 });
```

| Request takes | What happens |
|---|---|
| 100ms | `loading` never becomes `true`. The result is applied at 100ms. |
| 300ms | `loading` becomes `true` at 200ms and stays until 700ms. |
| 900ms | `loading` becomes `true` at 200ms and ends at 900ms. |

With a delay:

- `minDuration` is counted from when the loader appears.
- Calling `run()` while the loader is visible keeps it visible without blinking.
- Calling `run()` while the delay is still counting down does not restart the countdown. The delay measures how long you have been waiting, so the loader can appear even if the newest request is itself shorter than `delay`.
- `reset()` and unmounting cancel a pending loader.

## How `run()` promises settle

- The latest run settles when the loader is done, so after any `minDuration` wait.
- A run that has been replaced by a newer `run()` or by `reset()` does not update the state. Its promise still resolves or rejects with its own outcome, so code after `await run(...)` still executes for it.
- If a newer `run()`, `reset()` or an unmount happens during the `minDuration` wait, the waiting promise settles right away.
- After an unmount, a promise settles as soon as your function does.

Changes to `minDuration` or `delay` apply to later calls to `run()`.

## Running Tests

```
npm install
npm test
```

The tests cover:

- Success, errors and synchronous throws
- Overlapping runs finishing in either order
- `reset()` and unmount during a request and during the `minDuration` wait
- React StrictMode
- `delay`, `minDuration` and `isPending`

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Contribution

Contributions welcome! Suggestions for enhancements, better UX, or TypeScript improvements are appreciated.

## License

MIT © Syed Amanullah Wasti
