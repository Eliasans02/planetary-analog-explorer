/** Owns one displayed resource while an abortable replacement is prepared. */
export function latestResource<Key, Resource>(options: {
  load: (key: Key, signal: AbortSignal) => Promise<Resource>;
  display: (resource: Resource, key: Key) => void;
  release: (resource: Resource) => void;
  loading: (key: Key) => void;
  failed: (error: unknown, key: Key) => void;
}) {
  let revision = 0;
  let disposed = false;
  let pending: AbortController | undefined;
  let current: Resource | undefined;
  return {
    async request(key: Key) {
      if (disposed) return;
      const request = ++revision;
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      options.loading(key);
      let resource: Resource | undefined;
      try {
        resource = await options.load(key, controller.signal);
        if (disposed || request !== revision) { options.release(resource); return; }
        options.display(resource, key);
        const previous = current;
        current = resource;
        resource = undefined;
        if (previous !== undefined) options.release(previous);
      } catch (error) {
        if (resource !== undefined) options.release(resource);
        if (!disposed && request === revision) options.failed(error, key);
      } finally {
        if (request === revision) pending = undefined;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++revision;
      pending?.abort();
      if (current !== undefined) options.release(current);
      current = undefined;
    },
  };
}
