/**
 * What a render of the city was made from (spec 2026-10-25 §4): a hash of the map data the render depends on, the
 * city description files, and the generator's and render script's versions. A build refuses a render whose hash
 * doesn't match, and Studio says it's out of date. The hash function is passed in (Node's SHA-256), so the browser never needs it.
 */

interface MapLike {
  districts?: { id?: unknown; border?: unknown }[];
  places?: { id?: unknown; pin?: unknown; district?: unknown; on?: unknown; level?: unknown; side?: unknown }[];
  ambience?: { signs?: { at?: unknown; color?: unknown; size?: unknown }[]; plumes?: unknown; traffic?: { kind?: unknown; path?: unknown; z?: unknown }[] };
}

/** A city file as the render sees it: a district style's `blackout.outage` is the game's (blackouts phase 3), so tuning it leaves the render current. */
function rendered(f: { name: string; text: string }): string {
  if (!f.name.startsWith('districts/')) return f.text;
  try {
    const style = JSON.parse(f.text) as { blackout?: { outage?: unknown } };
    if (style.blackout?.outage === undefined) return f.text;
    delete style.blackout.outage;
    return JSON.stringify(style);
  } catch {
    return f.text;
  }
}

export function cityDataHash(
  mapJson: unknown,
  cityFiles: { name: string; text: string }[],
  versions: { generator: string; render: string },
  hash: (s: string) => string,
): string {
  const m = (mapJson ?? {}) as MapLike;
  const canon = {
    // No label reaches the render (the water floods from its own point), so a district's name can move freely.
    districts: (m.districts ?? []).map((d) => [d.id, d.border]),
    places: (m.places ?? []).map((p) => [p.id, p.pin, p.district, p.on ?? null, p.level ?? null, p.side ?? null]),
    // Signs' places and colours, roads' paths and heights; not how fast anything blinks or drives.
    signs: (m.ambience?.signs ?? []).map((s) => [s.at, s.color, s.size]),
    traffic: (m.ambience?.traffic ?? []).map((t) => [t.kind, t.path, t.z ?? 0]),
    files: [...cityFiles].sort((a, b) => a.name.localeCompare(b.name)).map((f) => [f.name, rendered(f)]),
    versions,
  };
  return hash(JSON.stringify(canon));
}
