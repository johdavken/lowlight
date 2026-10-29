/**
 * HIRE (crew spec §4): a tab per hiring place, tonight's cards on each. HIRE works only where you stand; elsewhere
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
  let place = v.hires.find((h) => h.place === v.here)?.place ?? v.hires[0].place;
  const head = el('div', 'cr-hire-head');
  const tabs = el('div', 'cr-places');
  const places = v.hires.map((h) => {
    const b = el('button', 'cr-place', h.name.toUpperCase());
    b.type = 'button';
    b.addEventListener('click', () => {
      place = h.place;
      draw();
    });
    return b;
  });
  tabs.append(...places);
  const title = el('h2', '');
  const where = el('span', 'cr-where');
  head.append(title, where, tabs);
  const cards = el('div', 'cr-cards');
  root.append(head, cards, el('div', 'cr-foot', `Hiring takes a free slot (${v.used}/${v.slots}). Wages come out at 06:00; skip a night and loyalty drops. New faces at 06:00.`));

  function draw(): void {
    const h = v.hires.find((x) => x.place === place)!;
    for (const [i, b] of places.entries()) b.classList.toggle('on', v.hires[i].place === place);
    title.textContent = h.name.toUpperCase();
    where.textContent = `${up(h.district)}${v.here === h.place ? ' · YOU ARE HERE' : ''}`;
    cards.replaceChildren(
      ...h.cards.map((c) => {
        if (c.locked) {
          const card = el('div', 'cr-card locked');
          const pic = el('div', 'cr-pic');
          pic.append(el('span', 'cr-spec', up(c.locked.spec)), el('span', 'cr-grade', GRADES[c.locked.grade]), el('span', 'cr-shadow', ''));
          const body = el('div', 'cr-body');
          body.append(el('div', 'cr-cname', '???'), el('div', 'cr-pitch', "Someone at the back is watching you. Not interested yet."), el('div', 'cr-lock', `🔒 ${up(h.district)} REP · ${TIER_NAMES[c.locked.tier - 1]}`));
          card.append(pic, body);
          return card;
        }
        const r = c.recruit;
        const card = el('div', 'cr-card');
        const pic = el('div', 'cr-pic');
        pic.append(el('span', 'cr-spec', up(r.spec)), el('span', 'cr-grade', GRADES[r.grade]), face(r, 'cr-card-face'));
        const body = el('div', 'cr-body');
        body.append(el('div', 'cr-cname', r.name.toUpperCase()));
        if (r.pitch) body.append(el('div', 'cr-pitch', r.pitch));
        for (const t of r.traits.filter((t) => t !== r.hidden)) {
          const tr = v.traits[t];
          if (tr) body.append(el('div', `cr-tr${tr.good ? '' : ' bad'}`, `${tr.good ? '+' : '−'} ${tr.label.toUpperCase()}`));
        }
        if (r.hidden) body.append(el('div', 'cr-tr q', '? ONE MORE TRAIT, SHOWN AFTER THREE RUNS'));
        const money = el('div', 'cr-money');
        const sign = el('span', '', 'SIGN-ON ');
        sign.append(el('b', '', String(c.cost)));
        const wage = el('span', '', 'WAGE ');
        wage.append(el('b', '', String(r.wage)));
        money.append(sign, wage);
        const here = v.here === h.place;
        const full = v.used >= v.slots;
        const short = v.sol < c.cost;
        const btn = el('button', 'cr-btn', !here ? 'GO THERE' : full ? 'NO FREE SLOT' : short ? `COSTS ${c.cost} SOL` : 'HIRE');
        btn.type = 'button';
        btn.disabled = !here || full || short;
        btn.addEventListener('click', () => o.act({ do: 'hire', recruit: r.id }));
        body.append(money, btn);
        card.append(pic, body);
        return card;
      }),
    );
  }
  draw();
  return root;
}
