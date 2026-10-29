/**
 * A tool call written into the story instead of made: GLM sometimes puts a line like
 * `*set_expression name: neutral*` in her reply (chat stress, 2026-10-14). The filter sits on her streamed
 * text and drops such lines, and one blank line after one, so the paragraph spacing stays as it was.
 *
 * Only whole lines count: a line that starts with a snake_case name (a tool's, like `set_light`) is never story,
 * with arguments or narrated after it ("*set_light calls for room_1 through room_6 — all to 0*", 2026-10-15).
 * A line is held back only while it could still be one: an ordinary line goes out as soon as its first
 * word rules it out (`*sets the rag down*` waits for `*sets`, nothing more).
 */

/** A whole line that's a call: it starts with a snake_case name. */
const CALL_LINE = /^\*?\s*[a-z]+(?:_[a-z]+)+\b.*$/;
/** A line start that could still become one. */
const COULD_BE = [/^\*?_?$/, /^\*?[a-z][a-z_]*$/, /^\*?[a-z]+(?:_[a-z]+)+\b/];

const couldBeCall = (line: string) => {
  const s = line.replace(/^[ \t]*/, '');
  return COULD_BE.some((re) => re.test(s));
};
const isCall = (line: string) => CALL_LINE.test(line.trim());

export class StrayCallFilter {
  /** The current line, held while it could still be a call. */
  private held = '';
  /** The current line was ruled out: the rest of it streams straight through. */
  private passing = false;
  /** A call line was just dropped: a blank line right after it goes too. */
  private swallowBlank = false;

  /** Her next piece of text; returns what can be shown now. */
  push(chunk: string): string {
    let out = '';
    for (const ch of chunk) {
      if (this.passing) {
        out += ch;
        if (ch === '\n') this.passing = false;
        continue;
      }
      this.held += ch;
      if (ch === '\n') {
        out += this.decide(this.held.slice(0, -1), '\n');
        this.held = '';
      } else if (!couldBeCall(this.held)) {
        out += this.held;
        this.held = '';
        this.passing = true;
        this.swallowBlank = false;
      }
    }
    return out;
  }

  /** The end of a round or the reply: whatever is still held, unless it's a call. */
  flush(): string {
    const out = this.held === '' ? '' : this.decide(this.held, '');
    this.held = '';
    this.passing = false;
    return out;
  }

  /** A finished line (without its newline): dropped when it's a call, or a blank right after one. */
  private decide(line: string, end: string): string {
    if (isCall(line)) {
      this.swallowBlank = true;
      return '';
    }
    if (this.swallowBlank && line.trim() === '') {
      this.swallowBlank = false;
      return '';
    }
    this.swallowBlank = false;
    return line + end;
  }
}
