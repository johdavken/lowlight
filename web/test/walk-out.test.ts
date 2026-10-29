import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../shared/types';
import { greetAllowed, markWalkedOut, walkedOut, walkOutDue } from '../src/room/walk-out';

const m = (over: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role'>): ChatMessage => ({ text: '', toolLines: [], ts: 1, status: 'ok', ...over });
const leave = m({ id: 'u1', role: 'user', mode: 'end', leave: true });
const goodbye = (over: Partial<ChatMessage> = {}) => m({ id: 'a1', role: 'agent', mode: 'end', replyTo: 'u1', text: 'Go on, then.', ...over });

describe('walkOutDue', () => {
  it('is due once her reply to a LEAVE line has landed', () => expect(walkOutDue([leave, goodbye()])).toBe(true));
  it('not while her goodbye streams, nor when it failed', () => {
    expect(walkOutDue([leave, goodbye({ status: 'streaming' })])).toBe(false);
    expect(walkOutDue([leave, goodbye({ status: 'failed' })])).toBe(false);
  });
  it('not after a plain END SCENE', () => {
    const end = m({ id: 'u1', role: 'user', mode: 'end' });
    expect(walkOutDue([end, goodbye()])).toBe(false);
  });
  it('not once a later line follows (stay, then typing) (Review Focus 3)', () => {
    expect(walkOutDue([leave, goodbye(), m({ id: 'u2', role: 'user', text: 'wait' })])).toBe(false);
  });
  it('a hidden greet line after it is skipped', () => {
    expect(walkOutDue([leave, goodbye(), m({ id: 'g', role: 'user', mode: 'greet' })])).toBe(true);
  });
  it('not before anything was said', () => expect(walkOutDue([])).toBe(false));
  it('not for her goodbye to LET HER GO: the server already sent you solo', () => {
    const letGo = m({ id: 'u1', role: 'user', mode: 'end', leave: true, parting: 'her' });
    expect(walkOutDue([letGo, goodbye()])).toBe(false);
  });
});

describe('greetAllowed after LET HER GO', () => {
  it('back in her room later, she greets you', () => {
    const letGo = m({ id: 'u1', role: 'user', mode: 'end', leave: true, parting: 'her' });
    expect(greetAllowed(true, [letGo, goodbye()], new Set())).toBe(true);
  });
});

describe('walked out already', () => {
  it('not due for a goodbye you already walked out on (back from solo, before her greeting)', () => {
    expect(walkOutDue([leave, goodbye()], new Set(['a1']))).toBe(false);
    expect(walkOutDue([leave, goodbye()], new Set(['other']))).toBe(true);
  });

  it('markWalkedOut remembers the goodbye in storage; broken storage remembers nothing and never throws', () => {
    const store = new Map<string, string>();
    const local = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    markWalkedOut('a1', local);
    expect(walkedOut(local).has('a1')).toBe(true);
    const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    expect(() => markWalkedOut('a1', broken)).not.toThrow();
    expect(walkedOut(broken).size).toBe(0);
  });

  it('keeps only the newest 20', () => {
    const store = new Map<string, string>();
    const local = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    for (let i = 0; i < 25; i++) markWalkedOut(`g${i}`, local);
    expect(walkedOut(local).has('g0')).toBe(false);
    expect(walkedOut(local).has('g24')).toBe(true);
    expect(walkedOut(local).size).toBe(20);
  });
});

describe('greetAllowed', () => {
  it('no greeting while WALK OUT is up (a reload after LEAVE: you never left) (final review 1)', () => {
    expect(greetAllowed(true, [leave, goodbye()], new Set())).toBe(false);
  });
  it('a greeting once walked out on (back from solo), or after a plain END SCENE', () => {
    expect(greetAllowed(true, [leave, goodbye()], new Set(['a1']))).toBe(true);
    expect(greetAllowed(true, [m({ id: 'u1', role: 'user', mode: 'end' }), goodbye()], new Set())).toBe(true);
    expect(greetAllowed(false, [], new Set())).toBe(false);
  });
});
