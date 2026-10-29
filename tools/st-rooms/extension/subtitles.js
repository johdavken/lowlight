// Lowlight's dialogue box over SillyTavern's chat (with /lowchat on), as web/src/ui/feed.ts does it in the game:
// - a line too long for the band is paged, a screenful of whole lines at a time, with [CONTINUE ▸ n/N]: click it,
//   Page Down, or Enter/Space while the message box is empty. It stays on its last page.
// - Page Up opens the whole chat as history over a dimmed room; Page Up/Down scroll it; Escape closes it, and so
//   does a new line.

const PAGE_KEYS = ['PageDown', 'Enter', ' '];

export function mountSubtitles() {
  const chat = document.getElementById('chat');
  if (!chat) return;
  const btn = document.createElement('button');
  btn.className = 'll-continue';
  btn.hidden = true;

  /** The line being paged (its .mes_text), its page, and how many it has. */
  let current = null;
  let page = 0;
  let pages = 1;
  /** The newest message's id, so a new line resets the page and closes the history. */
  let newest = null;

  const lowChat = () => document.body.classList.contains('lowlight-chat');
  const historyOpen = () => document.body.classList.contains('ll-history');

  function unpage(t) {
    if (!t) return;
    t.style.maxHeight = '';
    t.style.overflow = '';
    t.scrollTop = 0;
  }

  /** Lays the newest line out in pages that fit the band (re-run on every change, stream and resize). */
  function layout() {
    const mes = chat.querySelector('.mes.last_mes');
    const text = mes?.querySelector('.mes_text') ?? null;
    if (text !== current) {
      unpage(current);
      current = text;
      page = 0;
    }
    if (!lowChat() || historyOpen() || !text || !mes) {
      unpage(text);
      btn.hidden = true;
      return;
    }
    unpage(text);
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 24;
    // The band's height, less the name row above the text, the message's padding and one line for CONTINUE.
    const above = text.getBoundingClientRect().top - mes.getBoundingClientRect().top;
    const below = parseFloat(getComputedStyle(mes).paddingBottom) || 0;
    const avail = chat.clientHeight - above - below - lineHeight;
    const pageHeight = Math.max(lineHeight, Math.floor(avail / lineHeight) * lineHeight);
    pages = Math.max(1, Math.ceil((text.scrollHeight - 1) / pageHeight));
    if (pages <= 1) {
      btn.hidden = true;
      return;
    }
    page = Math.min(page, pages - 1);
    text.style.maxHeight = `${pageHeight}px`;
    text.style.overflow = 'hidden';
    text.scrollTop = page * pageHeight;
    // Under the text, in the line the page leaves free (as in Lowlight's box). Only real changes touch the page:
    // the chat's own observer would otherwise see this and lay out again, forever.
    if (btn.previousElementSibling !== text) text.after(btn);
    btn.hidden = false;
    const label = `[CONTINUE ▸ ${page + 1}/${pages}]`;
    if (btn.textContent !== label) btn.textContent = label;
  }

  const canTurn = () => lowChat() && !historyOpen() && !btn.hidden && page < pages - 1;
  function turn() {
    if (!canTurn()) return false;
    page++;
    layout();
    return true;
  }

  function openHistory() {
    document.body.classList.add('ll-history');
    layout();
    chat.scrollTop = chat.scrollHeight;
  }
  function closeHistory() {
    document.body.classList.remove('ll-history');
    layout();
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    turn();
  });

  // Capture, ahead of SillyTavern's own handlers: Enter in an empty message box would otherwise ask for a reply.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!lowChat() || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const active = document.activeElement;
      const typing = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement || active?.isContentEditable;
      const emptyPrompt = active?.id === 'send_textarea' && active.value === '';
      if (e.key === 'PageUp') {
        e.preventDefault();
        e.stopPropagation();
        if (!historyOpen()) openHistory();
        else chat.scrollBy({ top: -chat.clientHeight * 0.85 });
      } else if (e.key === 'PageDown' && historyOpen()) {
        e.preventDefault();
        e.stopPropagation();
        chat.scrollBy({ top: chat.clientHeight * 0.85 });
      } else if (e.key === 'Escape' && historyOpen()) {
        e.preventDefault();
        e.stopPropagation();
        closeHistory();
      } else if (PAGE_KEYS.includes(e.key) && !e.shiftKey && canTurn() && (e.key === 'PageDown' || !typing || emptyPrompt)) {
        e.preventDefault();
        e.stopPropagation();
        turn();
      }
    },
    true,
  );

  // Every change to the chat: a new line (back to its first page, history closed), a streaming one, an edit or swipe.
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const id = chat.querySelector('.mes.last_mes')?.getAttribute('mesid') ?? null;
      if (id !== newest) {
        newest = id;
        page = 0;
        if (historyOpen()) document.body.classList.remove('ll-history');
      }
      layout();
    });
  }).observe(chat, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', layout);
  // /lowchat on or off.
  new MutationObserver(layout).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  layout();
  return { layout, openHistory, closeHistory };
}
