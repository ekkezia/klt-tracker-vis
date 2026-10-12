// Minimal observable store. One instance is shared by every module.
//
// Keys in use (see HANDOFF.md "State contract"):
//   mode        'story' | 'math'
//   stepIndex   index into engine.steps
//   chapter     the active chapter object (from chapters.js)
//   step        the active step object
//   frame       integer frame index in the active clip
//   trackFrame  array of {id,x,y,status,err?} for `frame` (or [])
//   call        active caller id or null
//   notebookOpen boolean
export function createState(initial = {}) {
  let state = { ...initial };
  const listeners = new Set();

  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      const changed = Object.keys(patch).filter((k) => prev[k] !== state[k]);
      if (changed.length) listeners.forEach((fn) => fn(state, changed, prev));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
