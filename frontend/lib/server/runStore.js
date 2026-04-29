const globalStore = globalThis.__ECOPROMPT_RUN_STORE__;

if (!globalStore) {
  globalThis.__ECOPROMPT_RUN_STORE__ = {
    nextId: 1,
    runs: new Map(),
  };
}

const store = globalThis.__ECOPROMPT_RUN_STORE__;

export function createRun(payload) {
  const id = store.nextId++;
  const createdAt = new Date().toISOString();
  const row = {
    id,
    created_at: createdAt,
    ...payload,
  };
  store.runs.set(id, row);
  return row;
}

export function getRun(id) {
  return store.runs.get(id) || null;
}
