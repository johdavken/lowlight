/**
 * The read (big jobs spec §3): the sentence with three empty slots and the word bank as chips. Click or
 * Tab to a slot, then a chip; a chip sits in one slot at a time (placing it again moves it). Enter on a
 * slot jumps to the chips; arrows move across them; Enter places. READ IT once all three are filled.
 */
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const EMPTY = '___';

export function mountReadBoard(host: HTMLElement, o: { parts: string[]; bank: string[]; onRead(picks: [string, string, string]): void }): { destroy(): void } {
  const picks: (string | null)[] = [null, null, null];
  let on = 0;
  const box = el('div', 'rb');
  const sentence = el('div', 'rb-sentence');
  const slots: HTMLButtonElement[] = [];
  o.parts.forEach((p, i) => {
    if (p) sentence.append(document.createTextNode(p));
    if (i < 3) {
      const s = el('button', 'rb-slot', EMPTY);
      s.type = 'button';
      s.onclick = () => select(i);
      s.onkeydown = (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        select(i);
        (chips.find((c) => !c.classList.contains('used')) ?? chips[0])?.focus();
      };
      slots.push(s);
      sentence.append(s);
    }
  });
  const bank = el('div', 'rb-bank');
  const chips = o.bank.map((w) => {
    const c = el('button', 'rb-chip', w);
    c.type = 'button';
    c.onclick = () => place(w);
    c.onkeydown = (e) => {
      const at = chips.indexOf(c);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') chips[(at + 1) % chips.length].focus();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') chips[(at - 1 + chips.length) % chips.length].focus();
      else if (e.key === 'Enter' || e.key === ' ') {
        place(w);
        slots[on]?.focus();
      } else return;
      e.preventDefault();
    };
    return c;
  });
  bank.append(...chips);
  const read = el('button', 'rb-read', 'READ IT');
  read.type = 'button';
  read.onclick = () => {
    if (picks.every((p) => p !== null)) o.onRead(picks as [string, string, string]);
  };
  box.append(sentence, bank, read);
  host.append(box);

  function select(i: number): void {
    on = i;
    paint();
  }
  /** The word into the selected slot (out of any other it sat in); then on to the next empty slot. */
  function place(w: string): void {
    const was = picks.indexOf(w);
    if (was >= 0) picks[was] = null;
    picks[on] = w;
    const next = [1, 2, 3].map((d) => (on + d) % 3).find((i) => picks[i] === null);
    if (next !== undefined) on = next;
    paint();
  }
  function paint(): void {
    slots.forEach((s, i) => {
      s.textContent = picks[i] ?? EMPTY;
      s.classList.toggle('on', i === on);
      s.classList.toggle('filled', picks[i] !== null);
    });
    for (const c of chips) c.classList.toggle('used', picks.includes(c.textContent));
    read.disabled = picks.some((p) => p === null);
  }
  paint();
  return { destroy: () => box.remove() };
}
