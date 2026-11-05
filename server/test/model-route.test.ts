import { describe, expect, it } from 'vitest';
import { ANTHROPIC_FALLBACK_MODEL, fromNative, routeFor, toNative } from '../src/model-route';

const OR = { provider: 'openrouter' as const, baseUrl: 'https://openrouter.test/api/v1', keyName: 'openrouter' };
const LOCAL = { provider: 'openai-compatible' as const, baseUrl: 'http://127.0.0.1:1234/v1', keyName: null };
const SONNET = 'anthropic/claude-sonnet-5.5';
const GLM = 'z-ai/glm-5.2';

describe('native ids', () => {
  it('toNative: dots to dashes, only for anthropic/ ids', () => {
    expect(toNative(SONNET)).toBe('claude-sonnet-5-5');
    expect(toNative('anthropic/claude-sonnet-5')).toBe('claude-sonnet-5');
    expect(toNative(GLM)).toBeNull();
  });

  it('fromNative: the stored form back', () => {
    expect(fromNative('claude-opus-5-5')).toBe('anthropic/claude-opus-5.5');
    expect(fromNative('claude-haiku-4-5')).toBe('anthropic/claude-haiku-4.5');
    expect(fromNative('claude-sonnet-5')).toBe('anthropic/claude-sonnet-5');
  });
});

describe('only plain Claude ids go to Anthropic', () => {
  it("OpenRouter's variants (:batch, ~…-latest) stay on OpenRouter", () => {
    expect(toNative('anthropic/claude-sonnet-5.5:batch')).toBeNull();
    expect(toNative('~anthropic/claude-sonnet-latest')).toBeNull();
    expect(routeFor(OR, { openrouter: 'or', anthropic: 'an', own: 'or' }, 'anthropic/claude-sonnet-5.5:batch')).toEqual({ provider: 'openrouter', baseUrl: OR.baseUrl, key: 'or', model: 'anthropic/claude-sonnet-5.5:batch' });
  });
});

describe('routeFor', () => {
  it('a Claude model with both keys goes to Anthropic', () => {
    expect(routeFor(OR, { openrouter: 'or', anthropic: 'an', own: 'or' }, SONNET)).toEqual({ provider: 'anthropic', key: 'an', model: SONNET, native: 'claude-sonnet-5-5' });
  });

  it('GLM with both keys stays on OpenRouter', () => {
    expect(routeFor(OR, { openrouter: 'or', anthropic: 'an', own: 'or' }, GLM)).toEqual({ provider: 'openrouter', baseUrl: OR.baseUrl, key: 'or', model: GLM });
  });

  it('a Claude model with only the OpenRouter key goes through OpenRouter', () => {
    expect(routeFor(OR, { openrouter: 'or', anthropic: null, own: 'or' }, SONNET)).toEqual({ provider: 'openrouter', baseUrl: OR.baseUrl, key: 'or', model: SONNET });
  });

  it('only the Anthropic key: a GLM character runs on Sonnet', () => {
    expect(routeFor(OR, { openrouter: null, anthropic: 'an', own: null }, GLM)).toEqual({ provider: 'anthropic', key: 'an', model: ANTHROPIC_FALLBACK_MODEL, native: 'claude-sonnet-5-5' });
  });

  it('no keys: no route', () => {
    expect(routeFor(OR, { openrouter: null, anthropic: null, own: null }, SONNET)).toBeNull();
  });

  it('an openai-compatible character keeps her own address', () => {
    expect(routeFor(LOCAL, { openrouter: null, anthropic: 'an', own: '' }, SONNET)).toEqual({ provider: 'openai-compatible', baseUrl: LOCAL.baseUrl, key: '', model: SONNET });
    expect(routeFor({ ...LOCAL, keyName: 'local' }, { openrouter: null, anthropic: 'an', own: null }, SONNET)).toBeNull();
  });
});
