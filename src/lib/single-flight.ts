/**
 * Coalesce concurrent work for the same key inside one server process.
 *
 * This complements a persistent cache: a cold cache can receive several
 * requests before the first one finishes and stores its result. Every caller
 * gets the same promise, and failures are cleared so the next request can try
 * again instead of inheriting a poisoned entry.
 */
export function createSingleFlight<K, V>() {
  const active = new Map<K, Promise<V>>();

  return (key: K, work: () => Promise<V>): Promise<V> => {
    const existing = active.get(key);
    if (existing) return existing;

    const promise = Promise.resolve().then(work);
    active.set(key, promise);
    const clear = () => {
      if (active.get(key) === promise) active.delete(key);
    };
    void promise.then(clear, clear);
    return promise;
  };
}
