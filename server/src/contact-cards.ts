import { normalSpec, type Specialty } from '../../shared/crew-book';
import type { ContactCard, HeldLead } from '../../shared/types';

/**
 * Who has a contact card (contact cards spec §1): each contact who gave the player a lead, in their trade
 * (`standing.vouches`), ordered by their first lead. Derived from the leads held, so a rewound lead takes its card back.
 */
export function contactCardsFrom(
  held: HeldLead[],
  info: (id: string) => { name: string; accent: string; portrait: string | null } | null,
  trade: (id: string) => Specialty | undefined,
): ContactCard[] {
  const first = new Map<string, number>();
  for (const h of held) first.set(h.givenBy, Math.min(first.get(h.givenBy) ?? Infinity, h.at));
  return [...first]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .flatMap(([id]) => {
      const who = info(id);
      const spec = normalSpec(trade(id)) as Specialty | undefined;
      return who && spec ? [{ id, name: who.name, accent: who.accent, portrait: who.portrait, spec }] : [];
    });
}

/** Test-only (e2e): `NIX_TEST_GIVERS="hicks@cass"` counts Cass as having given that player a lead; unset or unreadable: none. */
export function giversFromEnv(player: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const parts = (env.NIX_TEST_GIVERS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const out = parts.map((p) => /^([a-z0-9-]+)@([a-z0-9-]+)$/.exec(p)).filter((m): m is RegExpExecArray => m !== null);
  return out.length === parts.length ? out.filter((m) => m[1] === player).map((m) => m[2]) : [];
}
