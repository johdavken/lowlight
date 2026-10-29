/**
 * An old `identity: "<server>:<profile>"`: a profile on the chat backend the game no longer has. The
 * game loads such a character with no mind, and Studio opens her that way. A file in her folder (the
 * only identity now) never starts with a word and a colon.
 */
export const oldProfileIdentity = (identity: unknown): boolean => typeof identity === 'string' && /^[a-z]+:/.test(identity);
