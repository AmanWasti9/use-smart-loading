# Changelog

## 0.2.0 - 2026-11-29

### Added

- `delay` option (milliseconds, default `0`). A `run()` that finishes before the delay ends does not set `loading`. Once shown with a delay, the loader stays for `minDuration`, counted from when it appeared.
- `isPending` value: `true` from the moment `run()` is called until the latest run has finished, including any `minDuration` wait.
- `SmartLoadingOptions` and `UseSmartLoadingResult<T>` type exports.
- `runWithSignal()`, which passes an `AbortSignal` to your function and aborts it when a newer run starts, on `reset()`, or on unmount. `run()` is unchanged and still passes no arguments.
- Without a type argument on the hook, each `run()` call now returns the type of its own function instead of `unknown`.
- `LICENSE` file.

### Fixed

- A `run()` promise could stay pending forever if another `run()`, `reset()` or an unmount happened during the `minDuration` wait. It now settles with its own result or error.
- Plain Node `import` and `require` failed with `ERR_MODULE_NOT_FOUND`.
- Test files were shipped in the published package. The build now empties `dist` first and does not compile tests.

### Changed

- New package description.
- The package declares `"type": "module"` and an `exports` field. It is ES modules only. `require()` works on Node versions that can load ES modules with it (20.19+, 22.12+ and later).
- Because of `exports`, only `use-smart-loading` and `use-smart-loading/package.json` can be imported. Deep imports such as `use-smart-loading/dist/useSmartLoading.js` no longer resolve.
- A run replaced by a newer `run()` or by `reset()` during the `minDuration` wait now settles immediately.
- Unmounting ends the `minDuration` wait, and a request that finishes after unmount no longer starts one.

With the default `delay: 0`, loader timing is the same as in 0.1.1.

## 0.1.1

- Previous release.
