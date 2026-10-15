// Widget registry. Contract (see HANDOFF.md):
//
//   mount(container: HTMLElement, api) -> (() => void) | void
//
//   api = {
//     state,        // shared store (js/engine/state.js)
//     stage,        // { grabFrame(), grabFramesAt(frames), onFrame(fn), frame, tracks }
//     chapter,      // the chapter object the widget belongs to
//   }
//
// A widget renders into `container` only, reads pixels with
// api.stage.grabFrame() (current frame) or grabFramesAt([...]) (seeks; ignore
// the onFrame events it causes), and returns an optional cleanup function that
// is called before the next widget mounts. Playgrounds share js/widgets/pg.js.

import { mountStructureTensor } from './structureTensor.js';
import { mountDisplacement } from './displacement.js';
import { mountFlow1d } from './flow1d.js';
import { mountLkPlayground } from './lkPlayground.js';
import { mountPyramidPlayground } from './pyramidPlayground.js';
import { mountPyramidSynth } from './pyramidSynth.js';
import { mountAperturePlayground } from './aperturePlayground.js';
import { mountPipelinePlayground } from './pipelinePlayground.js';
import { mountServoPlayground } from './servoPlayground.js';

const registry = new Map([
  ['displacement', mountDisplacement],             // Ch 0
  ['flow-1d', mountFlow1d],                        // Ch 1
  ['aperture', mountAperturePlayground],           // Ch 2
  ['structure-tensor', mountStructureTensor],      // Ch 2
  ['pyramid-synth', mountPyramidSynth],            // Ch 3 (test scene)
  ['pyramid', mountPyramidPlayground],             // Ch 3 (real footage)
  ['lk-iterations', mountLkPlayground],            // Ch 4
  ['pipeline-inspector', mountPipelinePlayground], // Ch 5
  ['servo', mountServoPlayground],                 // Ch 6
]);

export function registerWidget(id, mount) {
  registry.set(id, mount);
}

/** Mount function for `id`; chapters without a playground (widget: null) get nothing. */
export function getWidget(id) {
  if (!id) return () => {};
  return registry.get(id) ?? ((el) => { el.innerHTML = `<p class="todo">No widget registered for “${id}”.</p>`; });
}
