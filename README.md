# **use-smart-loading**

![GitHub Workflow Status](https://img.shields.io/badge/status-production-green) ![npm version](https://img.shields.io/npm/v/use-smart-loading) ![License](https://img.shields.io/npm/l/use-smart-loading)

**A smart React hook to manage async loading states with smooth UX, race-condition safety, and minimum loader duration.**  

---

## **Why use-smart-loading?**

Most React tutorials handle loading naively:

```ts
const data = await fetchData();
setData(data);
setLoading(false);
```
Problems with this approach:
- Flickering loaders for fast API calls
- Race conditions if multiple async calls happen at once
- Errors if component unmounts before async call finishes

**use-smart-loading** solves all of this with:

- **Race-condition-safe async calls** – old calls are ignored automatically
- **Minimum loader duration** – avoids flickering loaders
- **Unmount-safe state updates** – prevents “Cannot update state on unmounted component” errors
- **Easy to use** – one hook, two callbacks (`run` and `reset`)

## When to use this hook

- When you want flicker-free loading UX
- When the same async action can be triggered multiple times
- When you want safe async handling without manual cleanup
- When you need a reusable loading pattern across components

## When NOT to use this hook

- For simple one-off effects that never re-run
- If you already use a data-fetching library like React Query or SWR


## Installation
```
npm install use-smart-loading
```
or
```
yarn add use-smart-loading
```

## Usage
```
import React from "react";
import { useSmartLoading } from "use-smart-loading";

interface User {
  id: number;
  name: string;
}

export function Users() {
  const { loading, data, error, run, reset } = useSmartLoading<User[]>();

  const fetchUsers = async () => {
    const res = await fetch("https://jsonplaceholder.typicode.com/users");
    if (!res.ok) throw new Error("Failed to fetch users");
    return res.json();
  };

  return (
    <div>
      <button onClick={() => run(fetchUsers)}>Load Users</button>
      <button onClick={reset}>Reset</button>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{(error as Error).message}</p>}
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

## API
**useSmartLoading(options?)**
```
const { loading, data, error, run, reset } = useSmartLoading<T>({
  minDuration?: number; // Minimum loader duration in milliseconds, default: 500
});
```
- **loading** – `boolean`, indicates if the async operation is running
- **data** – `T | null`, the result of the last async operation
- **error** – `unknown`, error object if async failed
- **run(asyncFn: () => Promise<T>)** – triggers your async function safely
- **reset()** – clears `data`, `error`, and cancels pending async updates

## Options

| Option       | Type   | Default | Description                              |
|-------------|--------|---------|------------------------------------------|
| `minDuration` | number | 500     | Minimum time (ms) the loader will show |

## Example With Min Duration
```
const { loading, data, run } = useSmartLoading<{ id: number; name: string }[]>({ minDuration: 1000 });

run(async () => fetch("/api/users").then(res => res.json()));
```
Even if API resolves in 100ms, loader will stay visible for at least 1000ms.

## Tested Features

- ✅ Async race conditions handled
- ✅ Component unmount safe
- ✅ Loader flicker prevention
- ✅ Easy reset

## Running Unit Tests
```
npm install
npm run test
```
Tests include:

- Loading state
- Data assignment
- Reset functionality
- MinDuration enforcement

## Contribution
Contributions welcome! Suggestions for enhancements, better UX, or TypeScript improvements are appreciated.

## License
MIT © Syed Amanullah Wasti
