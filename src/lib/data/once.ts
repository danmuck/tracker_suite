// Runs an async job once and shares it. Pure: no framework, browser or server imports.

/**
 * Every call returns the same promise: concurrent callers share one run, and a success is never
 * run again. A failure (rejection or synchronous throw) reaches every caller waiting on that run
 * and is then forgotten, so the next call runs the job again.
 */
export function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let current: Promise<T> | null = null;
  return () => {
    if (current) return current;
    const run = (async () => fn())();
    current = run;
    run.catch(() => {
      if (current === run) current = null;
    });
    return run;
  };
}
