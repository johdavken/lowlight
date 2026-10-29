// What the welcome's Y changes in SillyTavern's own settings (spec 2026-10-23 §3): function calling on (her room tools
// need it), and the context raised only from SillyTavern's untouched default. A size the player set stays theirs, with
// advice when it's too small to keep the scene. These settings are SillyTavern's, shared by all their chats.

/** SillyTavern's Chat Completion default context: a fresh install, not a choice. */
export const ST_DEFAULT_CONTEXT = 4095;
/** What the welcome raises that default to. */
export const LOWLIGHT_CONTEXT = 32768;
/** Below this a Lowlight card, the roleplay guide and the lore leave little room for the chat itself. */
export const ADVISED_CONTEXT = 16384;

export interface SettingsPlan {
  /** Turn function calling on. */
  functionCalling: boolean;
  /** The context size to set, or null to leave it. */
  context: number | null;
  /** What Y changes, one line each (shown on the welcome and in the notice after). */
  changes: string[];
  /** What the player may want to change themselves. */
  advice: string[];
}

const n = (v: number) => v.toLocaleString('en');

export function planSettings(now: { mainApi: string; functionCalling: boolean; context: number }): SettingsPlan {
  const plan: SettingsPlan = { functionCalling: false, context: null, changes: [], advice: [] };
  // Function calling and this context size are Chat Completion's, set even while another API is chosen (a fresh
  // SillyTavern starts on the Horde): they wait there for when the player connects one.
  if (now.mainApi !== 'openai') plan.advice.push('HER ROOM TOOLS NEED A CHAT COMPLETION API (ROOMS AND CAST WORK WITHOUT THEM)');
  if (!now.functionCalling) {
    plan.functionCalling = true;
    plan.changes.push('FUNCTION CALLING ON (her room tools need it)');
  }
  if (now.context === ST_DEFAULT_CONTEXT) {
    plan.context = LOWLIGHT_CONTEXT;
    plan.changes.push(`CONTEXT SIZE ${n(LOWLIGHT_CONTEXT)} TOKENS (room for the chat)`);
  } else if (now.context < ADVISED_CONTEXT) {
    plan.advice.push(`YOUR CONTEXT IS ${n(now.context)} TOKENS · LOWLIGHT WANTS 16K+ TO KEEP THE SCENE (API SETTINGS → CONTEXT SIZE)`);
  }
  return plan;
}
