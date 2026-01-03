import { useCallback, useEffect, useRef, useState } from "react";

interface SmartLoadingOptions {
  minDuration?: number;
}

export function useSmartLoading<T = unknown>(
  options: SmartLoadingOptions = {}
) {
  const { minDuration = 500 } = options; // Increased default for better UX

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);

  const mountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const run = useCallback(
    async (asyncFn: () => Promise<T>): Promise<T> => {
      const id = ++requestIdRef.current;
      const start = Date.now();
      
      // Clear any pending state updates from previous runs
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      setLoading(true);
      setError(null);
      // We don't clear data immediately strictly, but often preferred to keep old data until new arrives? 
      // Requirement says "simple but powerful". Let's keep data until replacement or explicit reset, 
      // but standard pattern is often "keep old data while loading". 
      // If we want to clear data on start, un-comment next line. 
      // setData(null); 

      try {
        const result = await asyncFn();

        if (requestIdRef.current !== id) {
          // A new request started while we were awaiting. Ignore this result's state update.
          // We still return the result as the promise resolved.
          return result;
        }

        const elapsed = Date.now() - start;
        const delay = Math.max(minDuration - elapsed, 0);

        if (delay > 0) {
          await new Promise((resolve) => {
            timeoutRef.current = setTimeout(resolve, delay);
          });
        }

        // Check again after delay
        if (!mountedRef.current || requestIdRef.current !== id) return result;

        setData(result);
        setLoading(false);
        return result;
      } catch (err) {
        if (requestIdRef.current !== id) throw err;

        const elapsed = Date.now() - start;
        const delay = Math.max(minDuration - elapsed, 0);

        if (delay > 0) {
          await new Promise((resolve) => {
            timeoutRef.current = setTimeout(resolve, delay);
          });
        }

        if (!mountedRef.current || requestIdRef.current !== id) throw err;

        setError(err);
        setLoading(false);
        throw err;
      }
    },
    [minDuration]
  );

  const reset = useCallback(() => {
    // Increment ID to cancel any pending runs' state updates
    requestIdRef.current++;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    if (!mountedRef.current) return;
    setLoading(false);
    setData(null);
    setError(null);
  }, []);

  return { loading, data, error, run, reset };
}
