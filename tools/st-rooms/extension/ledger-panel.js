// SYS → RESIDUAL → LEDGER (or /ledger): what her Residual keeps in this chat, read-only, and its ON/OFF switch, in the
// welcome's frame (welcome.css). /ledger is the way in on a phone, where the Keys bar isn't shown.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

let open = null;

export function closeLedger() {
  open?.();
}

/** `ledger`: { notes, recap } (ledger.ts); `name`: hers, for the title; `residual`: its isOn/set, for the switch. */
export function openLedger(ledger, name, residual) {
  closeLedger();
  const root = el('div', 'llw-root llr-root');
  const box = el('div', 'llw-box llr-box');
  box.append(el('div', 'llw-tag', '// RESIDUAL · BLACK LEDGER'), el('div', 'llw-title', `${String(name ?? 'HER').toUpperCase()}'S LEDGER`));
  const body = el('div', 'llr-body');
  const notes = ledger.notes ?? [];
  const section = (title, list) => {
    if (!list.length) return;
    body.append(el('div', 'llr-head', title));
    for (const n of list) {
      const row = el('div', 'llr-note');
      row.append(el('span', 'llr-text', n.text));
      if (n.keys?.length) row.append(el('span', 'llr-keys', n.keys.join(' · ')));
      body.append(row);
    }
  };
  section('PINNED', notes.filter((n) => n.pinned));
  section('HER OWN', notes.filter((n) => !n.pinned && n.about === 'me'));
  section('ABOUT YOU', notes.filter((n) => !n.pinned && n.about === 'you'));
  if (ledger.recap) {
    body.append(el('div', 'llr-head', 'RECAP'), el('div', 'llr-recap', ledger.recap));
  }
  if (!body.childElementCount) body.append(el('div', 'llw-small', 'Nothing in the ledger yet.'));
  const keys = el('div', 'llw-keys');
  const close = el('span', 'llw-key', '[ESC] CLOSE');
  const toggle = el('span', 'llw-key');
  const paintToggle = () => (toggle.textContent = residual.isOn() ? '[O] SWITCH IT OFF' : '[O] SWITCH IT ON');
  paintToggle();
  keys.append(close, toggle);
  box.append(body, keys);
  root.append(box);
  document.body.append(root);
  const flip = () => {
    residual.set(!residual.isOn());
    paintToggle();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') done();
    else if (e.key.toLowerCase() === 'o') flip();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const done = () => {
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    open = null;
  };
  open = done;
  window.addEventListener('keydown', onKey, true);
  close.addEventListener('click', done);
  toggle.addEventListener('click', flip);
  root.addEventListener('click', (e) => {
    if (e.target === root) done();
  });
}
