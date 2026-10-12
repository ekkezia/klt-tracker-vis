// Phone-call overlay on the stage. Shows whichever doctor(s) are on the line
// for the active step (state.call is null, an id, or an array of ids).

import { portrait } from './dialogue.js';

export function createPhoneCall(root, state, characters, announce) {
  let current = '';
  let leaveTimer = 0;
  state.subscribe((s, changed) => {
    if (!changed.includes('call') && !changed.includes('callState')) return;
    const ids = s.call == null ? [] : [].concat(s.call);
    const ringing = s.callState === 'ringing';
    const key = ids.join(',') + (ringing ? ':ring' : '');
    if (key === current) return;
    current = key;
    clearTimeout(leaveTimer);
    if (!ids.length) {
      if (root.hidden) return;
      root.classList.add('call--leave');                  // slide out, then hide
      leaveTimer = setTimeout(() => { root.hidden = true; root.innerHTML = ''; root.classList.remove('call--leave'); }, 320);
      return;
    }
    const entering = root.hidden || root.classList.contains('call--leave');
    root.classList.remove('call--leave');
    root.hidden = false;
    if (entering) { root.classList.remove('call--enter'); void root.offsetWidth; root.classList.add('call--enter'); }
    root.classList.toggle('call--ringing', ringing);
    root.innerHTML = `
      <p class="call__status"><span class="call__pulse" aria-hidden="true"></span>${ringing ? 'Calling…' : 'On call'}</p>
      ${ids.map((id) => `
        <div class="call__party" style="--accent:${characters[id].accent}">${portrait(id, characters, 'sm')}
          <p><span class="speaker__name">${characters[id].name}</span><span class="speaker__role">${characters[id].role}</span></p>
        </div>`).join('')}`;
    announce(`${ringing ? 'Calling' : 'Call connected:'} ${ids.map((id) => characters[id].name).join(' and ')}.`);
  });
}
