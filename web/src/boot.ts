// The page's entry: the deck (spec 2026-10-23 §6) is its own small app; everything else is the game.
if (/^\/deck\/?$/.test(location.pathname)) void import('./deck/deck').then((m) => m.startDeck());
else void import('./main');
