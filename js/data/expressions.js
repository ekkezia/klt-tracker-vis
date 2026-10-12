// Character expression frames, cut from 4x3 sheets by tools/split_sprites.py.
// All frames of one character share a canvas size and are registered to
// frame 01, so they can be swapped in place (talking / stop-motion).
//
// mouth: 'closed' | 'open' | 'wide' (descriptive).
// rest:  idle frame; a dialogue line can override it with `expression: '08'`.
// talk:  frames the stop-motion talking loop alternates between
//        (closed <-> open, with an occasional wide). Keep strong reactions
//        (surprise, laughter) out of it; use them via a line's `expression`.
// TODO(creative): portrait sheet for Dr. Lucas (same 4x3 format), when he returns.

export const expressions = {
  kanade: {
    dir: 'assets/characters/kanade',
    size: [381, 378],
    rest: '12',
    talk: { closed: ['12', '01', '10'], open: ['02', '03', '07', '06'], wide: ['05'] },
    frames: {
      '01': { name: 'warm smile', mouth: 'closed' },
      '02': { name: 'talking, smiling', mouth: 'open' },
      '03': { name: 'talking', mouth: 'open' },
      '04': { name: 'surprised “oh”', mouth: 'wide' },
      '05': { name: 'laughing', mouth: 'wide' },
      '06': { name: 'pursed “ooh”', mouth: 'open' },
      '07': { name: 'cheerful, talking', mouth: 'open' },
      '08': { name: 'wry smile', mouth: 'closed' },
      '09': { name: 'laughing, eyes closed', mouth: 'wide' },
      '10': { name: 'gentle smile', mouth: 'closed' },
      '11': { name: 'astonished', mouth: 'wide' },
      '12': { name: 'calm', mouth: 'closed' },
    },
  },
  tomasi: {
    dir: 'assets/characters/tomasi',
    size: [377, 385],
    rest: '01',
    talk: { closed: ['01', '02', '09'], open: ['03', '05', '06', '07', '11'], wide: ['04', '10'] },
    frames: {
      '01': { name: 'attentive', mouth: 'closed' },
      '02': { name: 'slight smile', mouth: 'closed' },
      '03': { name: 'talking', mouth: 'open' },
      '04': { name: 'explaining, “ah”', mouth: 'wide' },
      '05': { name: 'smiling, talking', mouth: 'open' },
      '06': { name: '“oh”', mouth: 'open' },
      '07': { name: '“oo”', mouth: 'open' },
      '08': { name: 'grin', mouth: 'wide' },
      '09': { name: 'content', mouth: 'closed' },
      '10': { name: 'talking, animated', mouth: 'wide' },
      '11': { name: 'talking, warm', mouth: 'open' },
      '12': { name: 'broad smile', mouth: 'closed' },
    },
  },
  wren: {
    dir: 'assets/characters/wren',
    size: [364, 353],
    rest: '01',
    talk: { closed: ['01', '11', '12'], open: ['02', '05', '06', '10'], wide: ['04', '07'] },
    frames: {
      '01': { name: 'neutral', mouth: 'closed' },
      '02': { name: 'small smile, talking', mouth: 'open' },
      '03': { name: '“oh”', mouth: 'open' },
      '04': { name: 'big “ah”', mouth: 'wide' },
      '05': { name: 'small “o”', mouth: 'open' },
      '06': { name: '“eh”', mouth: 'open' },
      '07': { name: 'big grin', mouth: 'wide' },
      '08': { name: '“ah”, tilted', mouth: 'wide' },
      '09': { name: '“ah”, to the side', mouth: 'wide' },
      '10': { name: 'open smile', mouth: 'open' },
      '11': { name: 'content smile', mouth: 'closed' },
      '12': { name: 'flat, thinking', mouth: 'closed' },
    },
  },
};

export const frameSrc = (who, id) => `${expressions[who].dir}/${id}.png`;

// Warm the cache so frame swaps never flash.
if (typeof Image !== 'undefined') {
  for (const who of Object.keys(expressions)) {
    for (const id of Object.keys(expressions[who].frames)) new Image().src = frameSrc(who, id);
  }
}
