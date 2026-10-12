// Widget registry. Contract (see HANDOFF.md):
//
//   mount(container: HTMLElement, api) -> (() => void) | void
//
//   api = {
//     state,        // shared store (js/engine/state.js)
//     stage,        // { grabFrame(): ImageData|null, onFrame(fn), frame, tracks }
//     chapter,      // the chapter object the widget belongs to
//   }
//
// A widget renders into `container` only, reads pixels with
// api.stage.grabFrame() (current video frame, native size), and returns an
// optional cleanup function that is called before the next widget mounts.

import { mountStructureTensor } from './structureTensor.js';
import { stubs } from './stubs.js';

const registry = new Map([
  ['structure-tensor', mountStructureTensor],
  ...Object.entries(stubs),
]);

export function registerWidget(id, mount) {
  registry.set(id, mount);
}

export function getWidget(id) {
  return registry.get(id) ?? ((el) => { el.innerHTML = `<p class="todo">No widget registered for “${id}”.</p>`; });
}
