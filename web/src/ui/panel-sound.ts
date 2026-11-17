/**
 * The panels' own sounds (PEOPLE, CREW, YOU, the lore BOOK, SYS and the box's settings; picked 2026-11-16 on the Panel
 * Sounds audition). Rows and tabs sound as the job board's do. Each panel says its moment; the page sets what plays it
 * once (a test that sets nothing hears nothing).
 */
export type PanelCue = 'row' | 'tab' | 'setting' | 'sys' | 'note-save' | 'note-delete' | 'hire' | 'send' | 'collect' | 'recall' | 'wear' | 'carry' | 'entry';
let play: (n: PanelCue) => void = () => {};
export const panelCue = (n: PanelCue): void => play(n);
export function setPanelCue(fn: (n: PanelCue) => void): void {
  play = fn;
}
