/**
 * HIRE (crew spec §4): the hiring places as a list on the panel's rail (a free hire, from a job or a vouch, in its own
 * colour), tonight's faces at the picked place as files side by side. HIRE works only where you stand; elsewhere
 * GO THERE. A card shows the traits you can see and a "?" for the one you learn on hiring; the teaser shows the
 * rep tier its grade needs.
 */
import { GRADES } from '../../../shared/crew-book';
import { TIER_NAMES } from '../../../shared/mission';
import type { CrewAction, CrewView } from '../../../shared/types';
import { el, face } from './crew-ui';

const up = (x: string) => x.toUpperCase().replace(/-/g, ' ');

export function hireTab(v: CrewView, o: { act(a: CrewAction): void }): HTMLElement {
  const root = el('div', 'cr-hire');
  if (v.hires.length === 0) return root.appendChild(el('div', 'cr-empty', 'NOWHERE IS HIRING.')).parentElement as HTMLElement;
  // By entry, not place: a vouched hire (crew spec §5) is its own tab, even at a place that hires.
  // Where you stand: its own hires first, else a vouched card there (a contact's home that doesn't hire).
  const at = v.hires.findIndex((h) => h.place === v.here && !h.vouched);
  // A job's free hire goes first, wherever you stand: it's gone at 06:00.
  const job = v.hires.findIndex((h) => h.cards.some((c) => c.from && 'job' in c.from));
  let sel = Math.max(0, job >= 0 ? job : at >= 0 ? at : v.hires.findIndex((h) => h.place === v.here));
  const head = el('div', 'cr-hire-head');
  const tabs = el('div', 'cr-places tp-list');
  const places = v.hires.map((h, i) => {
    const b = el('button', `cr-place tp-row${h.vouched ? ' vouched' : ''}${h.cards.some((c) => c.from && 'job' in c.from) ? ' job' : ''}`, h.vouched ? `${h.name.toUpperCase()} · ${h.vouched.name.toUpperCase()}` : h.name.toUpperCase());
    b.type = 'button';
    if (h.vouched?.accent) b.style.setProperty('--cr-vouch', h.vouched.accent);
    // Under the name, in CSS: where it is, whether you stand there, how many faces tonight.
    const n = h.cards.filter((c) => c.recruit).length;
    b.dataset.sub = [h.vouched ? 'VOUCHED · FREE' : h.cards.some((c) => c.from && 'job' in c.from) ? 'FROM A JOB · FREE' : null, up(h.district), v.here === h.place ? 'YOU ARE HERE' : null, n === 0 ? 'NOBODY TONIGHT' : `${n} TONIGHT`].filter(Boolean).join(' · ');
    b.addEventListener('click', () => {
      sel = i;
      draw();
    });
    return b;
  });
  tabs.append(...places);
  const title = el('h2', 'tp-name');
  const where = el('div', 'cr-where tp-role');
  head.append(title, where, el('div', 'cr-dh tp-head', 'TONIGHT'));
  const cards = el('div', 'cr-cards');
  cards.dataset.keep = 'cards';
  const left = el('div', 'cr-hire-left');
  left.append(el('div', 'cr-dh tp-head', 'PLACES'), tabs, el('div', 'cr-dh tp-head quiet', 'HOW IT WORKS'), el('div', 'cr-foot', `Hiring takes a free slot (${v.used}/${v.slots}). Wages come out at 06:00; skip a night and loyalty drops. New faces at 06:00.`));
  const main = el('div', 'cr-hire-main tp-file');
  main.append(head, cards);
  root.append(left, main);

  function draw(): void {
    const h = v.hires[sel];
    for (const [i, b] of places.entries()) b.classList.toggle('on', i === sel);
    title.textContent = h.name.toUpperCase();
    where.textContent = `${up(h.district)}${v.here === h.place ? ' · YOU ARE HERE' : ''}`;
    cards.replaceChildren(
      ...h.cards.map((c) => {
        if (c.locked) {
          const card = el('div', 'cr-card locked');
          const pic = el('div', 'cr-pic tp-face');
          pic.append(el('span', 'cr-shadow', '?'));
          const side = el('div', 'cr-side');
          side.append(el('span', 'cr-grade', GRADES[c.locked.grade]), el('span', 'cr-spec', up(c.locked.spec)));
          const body = el('div', 'cr-body');
          body.append(el('div', 'cr-cname', '???'), el('div', 'cr-pitch', "Someone at the back is watching you. Not interested yet."), el('div', 'cr-lock', `🔒 ${up(h.district)} REP · ${TIER_NAMES[c.locked.tier - 1]}`));
          card.append(pic, side, body);
          return card;
        }
        const r = c.recruit;
        const card = el('div', `cr-card${c.from ? ' free' : ''}`);
        if (h.vouched?.accent) card.style.setProperty('--cr-vouch', h.vouched.accent);
        const pic = el('div', 'cr-pic tp-face');
        pic.append(face(r, 'cr-card-face'));
        const side = el('div', 'cr-side');
        side.append(el('span', 'cr-grade', GRADES[r.grade]), el('span', 'cr-spec', up(r.spec)));
        const body = el('div', 'cr-body');
        // A free card (crew spec §5): who vouched, or the job it came from.
        if (c.from) body.append(el('div', 'cr-vouch', 'vouched' in c.from ? `VOUCHED BY ${c.from.name.toUpperCase()}` : `FROM THE JOB · ${c.from.title.toUpperCase()}`));
        body.append(el('div', 'cr-cname', r.name.toUpperCase()));
        if (r.pitch) body.append(el('div', 'cr-pitch', r.pitch));
        for (const t of r.traits.filter((t) => t !== r.hidden)) {
          const tr = v.traits[t];
          if (tr) body.append(el('div', `cr-tr${tr.good ? '' : ' bad'}`, `${tr.good ? '+' : '−'} ${tr.label.toUpperCase()}`));
        }
        if (r.hidden) body.append(el('div', 'cr-tr q', '? ONE MORE TRAIT, SHOWN AFTER THREE RUNS'));
        // The ability they come with (crew abilities spec §4).
        for (const id of r.abilities ?? []) {
          const a = v.abilities[id];
          if (a) body.append(el('div', 'cr-tr ab', `◆ ${a.label.toUpperCase()} · ${a.job}`));
        }
        const money = el('div', 'cr-money');
        const sign = el('span', '', c.from ? 'FREE' : 'SIGN-ON ');
        if (!c.from) sign.append(el('b', '', String(c.cost)));
        const wage = el('span', '', 'WAGE ');
        wage.append(el('b', '', String(r.wage)));
        money.append(sign, wage);
        const here = v.here === h.place;
        const full = v.used >= v.slots;
        const short = v.sol < c.cost;
        const btn = el('button', 'cr-btn tp-key', !here ? 'GO THERE' : full ? 'NO FREE SLOT' : short ? `COSTS ${c.cost} SOL` : 'HIRE');
        btn.type = 'button';
        btn.disabled = !here || full || short;
        btn.addEventListener('click', () => o.act({ do: 'hire', recruit: r.id }));
        side.append(money);
        body.append(btn);
        card.append(pic, side, body);
        return card;
      }),
    );
  }
  draw();
  return root;
}
