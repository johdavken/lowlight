/** The models shipped as picks at select, first in the list; `why` is the one line shown under each. */
export interface ModelPick {
  id: string;
  why: string;
}

export const MODEL_PICKS: ModelPick[] = [
  { id: 'z-ai/glm-5.2', why: 'her default · strong in character, cheap' },
  { id: 'deepseek/deepseek-v4-pro-0813', why: 'cheap, solid all-rounder' },
  { id: 'anthropic/claude-sonnet-5.5', why: 'best writing; pricier for long nights' },
];
