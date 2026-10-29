/**
 * A job's passive lines (small jobs spec §3): each `⟦WITS⟧ ` marker in `root`'s text becomes
 * `<span class="qr-passive">WITS ·</span>`. Used by the feed's quest rows and the quest panel.
 */
export function passiveLabels(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes('⟦')) hits.push(n as Text);
  for (const t of hits) {
    const parts = t.data.split(/⟦([^⟧]+)⟧ ?/);
    const frag = document.createDocumentFragment();
    parts.forEach((p, i) => {
      if (i % 2 === 1) {
        const label = document.createElement('span');
        label.className = 'qr-passive';
        label.textContent = `${p} ·`;
        frag.append(label, document.createTextNode(' '));
      } else if (p) frag.append(document.createTextNode(p));
    });
    t.replaceWith(frag);
  }
}
