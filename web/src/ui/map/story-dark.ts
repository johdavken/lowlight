/**
 * The map follows the story's blackouts (blackouts phase 3 §4). While the admin panel is open its switches own the map;
 * the story's districts are kept and put back when it closes.
 */
export class StoryDark {
  private dark: string[] = [];
  constructor(
    private readonly apply: (ids: string[]) => void,
    private readonly devOpen: () => boolean,
  ) {}

  /** The districts dark now, from the server. */
  set(dark: string[]): void {
    this.dark = [...dark];
    if (!this.devOpen()) this.apply(this.dark);
  }

  /** The admin panel opened or closed. */
  devToggled(open: boolean): void {
    if (!open) this.apply(this.dark);
  }
}
