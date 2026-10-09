/** Origin-wide exclusive-lock fixture. A held gate lets tests observe the
 * pending interval before any reader/writer may enter the critical section. */
export function installSavedLocks() {
  const original = Object.getOwnPropertyDescriptor(navigator, "locks");
  let tail = Promise.resolve();
  let gate = Promise.resolve();
  const names: string[] = [];
  const request = <T>(name: string, callback: (lock: Lock) => T | Promise<T>): Promise<T> => {
    names.push(name);
    const admission = gate;
    const operation = tail.then(() => admission).then(() => callback({ name, mode: "exclusive" }));
    tail = operation.then(() => {}, () => {});
    return operation;
  };
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
  return {
    names,
    hold() {
      let release!: () => void;
      gate = new Promise<void>((resolve) => { release = resolve; });
      return () => { release(); gate = Promise.resolve(); };
    },
    restore() {
      if (original) Object.defineProperty(navigator, "locks", original);
      else Reflect.deleteProperty(navigator, "locks");
    },
  };
}
