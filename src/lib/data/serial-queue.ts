// Runs async jobs one at a time, in submission order.
// Pure: no framework, browser or server imports.

export type SerialQueue = <T>(job: () => Promise<T>) => Promise<T>;

/**
 * Each job starts only after the previous one has settled. A job that rejects or throws
 * passes its error to its own caller and does not stop the jobs queued after it.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const result = tail.then(() => job());
    // The next job waits for this one to settle, whatever its outcome.
    tail = result.catch(() => undefined);
    return result;
  };
}
