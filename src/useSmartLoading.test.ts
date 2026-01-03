// tests/useSmartLoading.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSmartLoading } from "../src/useSmartLoading";

describe("useSmartLoading hook", () => {
  it("should handle loading, data, and reset properly", async () => {
    const fakeData = { id: 1, name: "John Doe" };

    // Simulate an async function
    const asyncFn = vi.fn(() => Promise.resolve(fakeData));

    const { result } = renderHook(() =>
      useSmartLoading<typeof fakeData>({ minDuration: 500 })
    );

    // Initially, loading is false
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(null);

    // Run the async function
    await act(async () => {
      const data = await result.current.run(asyncFn);
      expect(data).toEqual(fakeData);
    });

    // After run, loading should be false, data should be set
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(fakeData);

    // Reset should clear state
    act(() => {
      result.current.reset();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it("should enforce minDuration for loader", async () => {
    const fakeData = { id: 1, name: "Quick Fetch" };
    const asyncFn = vi.fn(() => Promise.resolve(fakeData));

    const { result } = renderHook(() =>
      useSmartLoading<typeof fakeData>({ minDuration: 500 })
    );

    const startTime = Date.now();
    await act(async () => {
      await result.current.run(asyncFn);
    });
    const elapsed = Date.now() - startTime;

    // Loader must last at least minDuration
    expect(elapsed).toBeGreaterThanOrEqual(500);
  });
});
