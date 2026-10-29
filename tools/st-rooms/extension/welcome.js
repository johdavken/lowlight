// The first-run welcome (INSTALL THE LOWLIGHT CAST? [Y] / [N]) and the short notices after an install or update,
// in the Keys bar's look, over the live room (spec 2026-10-23 §3).

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/**
 * Asks once. Resolves true for Y (or a click on INSTALL), false for N, Esc or NOT NOW. `changes`: the SillyTavern
 * settings Y also changes (settings-plan.ts), named up front because they apply to all the player's chats.
 */
export function showWelcome(cast, changes = []) {
  const chars = cast.characters?.length ?? 0;
  const personas = (cast.characters ?? []).filter((c) => c.persona).length;
  return new Promise((resolve) => {
    const root = el('div', 'llw-root');
    const box = el('div', 'llw-box');
    const yes = el('span', 'llw-key llw-yes', '[Y] INSTALL');
    const no = el('span', 'llw-key', '[N] NOT NOW');
    box.append(
      el('div', 'llw-tag', '// LOWLIGHT'),
      el('div', 'llw-title', 'INSTALL THE LOWLIGHT CAST?'),
      el('div', 'llw-line', `${chars} characters · ${personas} personas · the city's lore`),
      el('div', 'llw-small', 'They go into your character and persona lists. You can install them later: type /lowcast.'),
      el('div', 'llw-small', 'Her Residual makes one more call after each reply to keep her notes (SYS → RESIDUAL to switch it off).'),
      ...(changes.length ? [el('div', 'llw-small', `Y also sets, for all your chats: ${changes.map((c) => c.replace(/ \(.*\)$/, '').toLowerCase()).join(' · ')}.`)] : []),
      el('div', 'llw-keys'),
    );
    box.lastChild.append(yes, no);
    root.append(box);
    document.body.append(root);
    const done = (answer) => {
      window.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve(answer);
    };
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'y' || k === 'enter') done(true);
      else if (k === 'n' || k === 'escape') done(false);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    yes.addEventListener('click', () => done(true));
    no.addEventListener('click', () => done(false));
  });
}

/** A short notice under the Keys bar for a few seconds (longer ones stay longer): each line its own row, and one
 * shown while another is up stacks under it (the settings notice and the install's come together). */
export function showNotice(lines) {
  const rows = lines.filter(Boolean);
  if (!rows.length) return;
  let stack = document.querySelector('.llw-notices');
  if (!stack) {
    stack = el('div', 'llw-notices');
    document.body.append(stack);
  }
  const n = el('div', 'llw-notice');
  for (const line of rows) n.append(el('div', '', line));
  stack.append(n);
  const ms = 6500 + 1500 * Math.max(0, rows.length - 2);
  setTimeout(() => n.classList.add('out'), ms);
  setTimeout(() => {
    n.remove();
    if (!stack.childElementCount) stack.remove();
  }, ms + 700);
}
