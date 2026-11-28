import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useSmartLoading } from "../src/index.js";

/** A fake request that can be aborted, like fetch. */
function fakeRequest(ms: number, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => resolve(`Done after ${ms}ms`), ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

/** Logs when the loader turns on and off, measured from the last click. */
function Panel(props: {
  title: string;
  loading: boolean;
  result: string | null;
  startedAt: number;
}) {
  const { title, loading, result, startedAt } = props;
  const [log, setLog] = useState<string[]>([]);
  const wasLoading = useRef(false);

  useEffect(() => setLog([]), [startedAt]);
  useEffect(() => {
    if (loading === wasLoading.current) return;
    wasLoading.current = loading;
    const at = Math.round(performance.now() - startedAt);
    setLog((lines) => [...lines, `Loader ${loading ? "on" : "off"} at ${at}ms`]);
  }, [loading, startedAt]);

  return (
    <section>
      <h2>{title}</h2>
      <div className="stage" aria-live="polite">
        {loading ? <span className="spinner" aria-label="Loading" /> : result}
      </div>
      <ol>
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      {startedAt > 0 && !loading && result && log.length === 0 && (
        <p>The loader never appeared.</p>
      )}
    </section>
  );
}

function Slider(props: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {props.label}
      <input
        type="range"
        min={0}
        max={props.max}
        step={50}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span>{props.value}ms</span>
    </label>
  );
}

function App() {
  const query = new URLSearchParams(location.search);
  const [duration, setDuration] = useState(Number(query.get("duration") ?? 100));
  const [delay, setDelay] = useState(200);
  const [minDuration, setMinDuration] = useState(500);
  const [startedAt, setStartedAt] = useState(0);

  const [plainLoading, setPlainLoading] = useState(false);
  const [plainData, setPlainData] = useState<string | null>(null);
  const smart = useSmartLoading<string>({ delay, minDuration });

  const start = () => {
    setStartedAt(performance.now());

    setPlainData(null);
    setPlainLoading(true);
    void fakeRequest(duration).then((result) => {
      setPlainData(result);
      setPlainLoading(false);
    });

    smart.reset();
    smart
      .runWithSignal((signal) => fakeRequest(duration, signal))
      .catch((err: unknown) => {
        // A newer request or reset() aborts this one, which is expected.
        if ((err as Error).name !== "AbortError") console.error(err);
      });
  };

  // "?autorun" starts a request on load.
  useEffect(() => {
    if (query.has("autorun")) start();
  }, []);

  return (
    <main>
      <h1>use-smart-loading</h1>
      <p>
        Try a 100ms request to see the plain loader flash, then a 300ms one to see
        the minimum duration.
      </p>
      <Slider label="Request takes" value={duration} max={2000} onChange={setDuration} />
      <Slider label="delay" value={delay} max={1000} onChange={setDelay} />
      <Slider label="minDuration" value={minDuration} max={2000} onChange={setMinDuration} />
      <button onClick={start}>Send request</button>
      <div className="panels">
        <Panel title="Plain loading state" loading={plainLoading} result={plainData} startedAt={startedAt} />
        <Panel title="useSmartLoading" loading={smart.loading} result={smart.data} startedAt={startedAt} />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
