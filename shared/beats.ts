/**
 * A reply with others here carries several voices: the contact's, and each other's in paragraphs
 * that start with their name and a colon (`Hae: …`, `Silas: …`). An encounter's stranger is one
 * more, marked the same way (`Courier: …`). This splits a reply into those beats as offsets into its
 * text, so the feed keeps typing and paging over the text as written.
 */
/** Someone here besides you and your contact (a place's resident, a contact the clock puts here). */
export interface Other {
  id: string;
  name: string;
}

export interface Beat {
  who: 'contact' | 'other' | 'stranger';
  /** The other's id, on an `other` beat only. */
  id?: string;
  /** Offsets into the original text: the beat runs [start, end); its marker (if any) is [start, bodyStart). */
  start: number;
  bodyStart: number;
  end: number;
  /** Every marker in the beat, [from, to) — one per paragraph when hers run on (`Hae: …` twice). */
  markers: Array<[number, number]>;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `Name:` at a paragraph's start, in the forms models write it: `**Name:**`, `**Name**:`, `*Name:*`, any case,
 * and with the pronoun they were introduced by (`Hae (she):`).
 */
function markerRe(name: string): RegExp {
  return new RegExp(`^\\s*(\\*{1,2})?${escape(name)}(\\*{1,2})?(?:\\s*\\((?:she|he|they)\\))?(\\*{1,2})?:(\\*{1,2})?[ \\t]*`, 'i');
}

/** Where each paragraph starts: 0, then just past each run of blank lines. */
function paragraphStarts(text: string): number[] {
  const starts = [0];
  for (const m of text.matchAll(/\n(?:[ \t]*\n)+/g)) {
    const at = m.index + m[0].length;
    if (at < text.length) starts.push(at);
  }
  return starts;
}

/**
 * Splits `text` into beats. With no others and no stranger the whole text is one contact beat,
 * markers and all (an old reply viewed somewhere else is shown as written). A paragraph that so far
 * reads only `Ha` stays the contact's until its marker completes. Others' markers are tried before
 * the stranger's, so a stranger can't take their paragraphs, and longer names first, so `Sil` never
 * takes Silas's.
 */
export function speakerBeats(text: string, others: Other[], contactName: string, strangerName: string | null = null): Beat[] {
  if (text === '') return [];
  if (others.length === 0 && strangerName === null) return [{ who: 'contact', start: 0, bodyStart: 0, end: text.length, markers: [] }];
  const theirs = [...others].sort((a, b) => b.name.length - a.name.length).map((o) => ({ id: o.id, re: markerRe(o.name) }));
  const stranger = strangerName === null ? null : markerRe(strangerName);
  const contact = markerRe(contactName);
  const starts = paragraphStarts(text);
  const beats: Beat[] = [];
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    const para = text.slice(start, end);
    let id: string | undefined;
    let marker: RegExpExecArray | null = null;
    for (const o of theirs) {
      marker = o.re.exec(para);
      if (marker) {
        id = o.id;
        break;
      }
    }
    const strangers = marker ? null : (stranger?.exec(para) ?? null);
    const who: Beat['who'] = marker ? 'other' : strangers ? 'stranger' : 'contact';
    marker = marker ?? strangers ?? contact.exec(para);
    const markerEnd = start + (marker ? marker[0].length : 0);
    const markers: Array<[number, number]> = marker ? [[start, markerEnd]] : [];
    const prev = beats.at(-1);
    if (prev && prev.who === who && prev.id === id) {
      prev.end = end;
      prev.markers.push(...markers);
      return;
    }
    beats.push({ who, ...(id !== undefined ? { id } : {}), start, bodyStart: markerEnd, end, markers });
  });
  return beats;
}
