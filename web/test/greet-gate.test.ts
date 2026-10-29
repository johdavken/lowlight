import { describe, expect, it } from 'vitest';
import { createGreetGate } from '../src/ui/greet-gate';

function gate() {
  let sent = 0;
  const g = createGreetGate(() => sent++);
  g.onConnect();
  return { g, sent: () => sent };
}

describe('greet gate', () => {
  it('due, no card, link ok: sends once, whatever order the events come in', () => {
    for (const order of [
      ['history', 'recap', 'link'],
      ['link', 'recap', 'history'],
      ['recap', 'history', 'link'],
    ]) {
      const { g, sent } = gate();
      for (const step of order) {
        if (step === 'history') g.onHistory(true);
        if (step === 'recap') g.onRecap(false);
        if (step === 'link') g.onLink('ok');
      }
      expect(sent()).toBe(1);
    }
  });

  it('with the recap card up, waits until it is dismissed', () => {
    const { g, sent } = gate();
    g.onHistory(true);
    g.onRecap(true);
    g.onLink('ok');
    expect(sent()).toBe(0);
    g.onRecapSeen();
    expect(sent()).toBe(1);
  });

  it('never sends when no greeting is due', () => {
    const { g, sent } = gate();
    g.onHistory(false);
    g.onRecap(false);
    g.onLink('ok');
    expect(sent()).toBe(0);
  });

  it('holds while the link is down, sends once it is ok', () => {
    const { g, sent } = gate();
    g.onHistory(true);
    g.onRecap(false);
    g.onLink('down');
    expect(sent()).toBe(0);
    g.onLink('ok');
    expect(sent()).toBe(1);
  });

  it('sends at most once per connection; a later recap or link event changes nothing', () => {
    const { g, sent } = gate();
    g.onHistory(true);
    g.onRecap(false);
    g.onLink('ok');
    g.onLink('lost');
    g.onLink('ok');
    g.onRecap(true);
    g.onRecapSeen();
    expect(sent()).toBe(1);
  });

  it('only the first recap after connecting counts (a recap she writes mid-visit is no card)', () => {
    const { g, sent } = gate();
    g.onHistory(true);
    g.onRecap(false);
    g.onRecap(true);
    g.onLink('ok');
    expect(sent()).toBe(1);
  });

  it('reports its state: waiting until it knows, then sent or not-due', () => {
    const { g } = gate();
    expect(g.state()).toBe('waiting');
    g.onHistory(true);
    g.onRecap(true);
    g.onLink('ok');
    expect(g.state()).toBe('waiting'); // the card is up
    g.onRecapSeen();
    expect(g.state()).toBe('sent');
    const other = gate().g;
    other.onHistory(false);
    expect(other.state()).toBe('not-due');
  });

  it('a reconnect starts over', () => {
    const { g, sent } = gate();
    g.onHistory(true);
    g.onRecap(false);
    g.onLink('ok');
    g.onConnect();
    g.onHistory(true);
    g.onRecap(false);
    expect(sent()).toBe(1); // no link yet on this connection
    g.onLink('ok');
    expect(sent()).toBe(2);
  });

  it('waits for the intro', () => {
    const { g, sent } = gate();
    g.onIntro(true);
    g.onHistory(true);
    g.onRecap(false);
    g.onLink('ok');
    expect(sent()).toBe(0);
    expect(g.state()).toBe('waiting');
    g.onIntroClosed();
    expect(sent()).toBe(1);
  });

  it('intro closed before the rest is ready changes nothing', () => {
    const { g, sent } = gate();
    g.onIntro(true);
    g.onIntroClosed();
    g.onHistory(true);
    g.onRecap(false);
    g.onLink('ok');
    expect(sent()).toBe(1);
  });

  it('reconnect keeps the intro gate', () => {
    const { g, sent } = gate();
    g.onIntro(true);
    g.onConnect();
    g.onHistory(true);
    g.onRecap(false);
    g.onLink('ok');
    expect(sent()).toBe(0);
  });
});
