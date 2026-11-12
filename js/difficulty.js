// Difficulty levels. Picked on the title screen, saved with the other settings ('run-settings'), and read by
// every other script as it loads (the house, the props, the monster, the player), so changing it reloads the page.
//
// noise: how far each sound you make carries (m). Sounds not listed (things you throw, the well winch, the
// lock buzzing, hammering) carry their usual distance times `hearing`.
const Difficulty = (function () {
  const LEVELS = {
    easy: {
      lighting: 'full',      // full: the house's lights work | dim: rooms are dark, halls dim | dark: every lamp is dead
      name: 'EASY', blurb: 'it is slow, and half deaf',
      spawnDelay: 45, chaseSpeed: 7.4, roamSpeed: 1.8, alertSpeed: 5.2, sight: 8, loseTime: 2, searchTime: 3,
      hearing: 0.7,
      noise: { slide: 3, land: 7, rummage: 7, drawer: 18, sprint: 0, walk: 0, wind: 0 },
      attention: 1.6,          // how long a thrown thing keeps it busy (x its search time)
      props: 1, lockers: 'easy', lockerOnce: false,
      hp: 100, damage: 20, medkits: 6, stamina: 1.33,
      fov: null, crankLight: false, startCharge: 1, chargeBar: true, totals: true,
    },
    normal: {
      lighting: 'full',      // full: the house's lights work | dim: rooms are dark, halls dim | dark: every lamp is dead
      name: 'NORMAL', blurb: 'the house as it was meant to be',
      spawnDelay: 20, chaseSpeed: 8.4, roamSpeed: 2.2, alertSpeed: 6.0, sight: 11, loseTime: 3, searchTime: 5,
      hearing: 1,
      noise: { slide: 5, land: 10, rummage: 10, drawer: 26, sprint: 0, walk: 0, wind: 0 },
      attention: 1,
      props: 1, lockers: 'normal', lockerOnce: false,
      hp: 100, damage: 25, medkits: 4, stamina: 1,
      fov: null, crankLight: false, startCharge: 1, chargeBar: true, totals: true,
    },
    hard: {
      lighting: 'dim',      // full: the house's lights work | dim: rooms are dark, halls dim | dark: every lamp is dead
      name: 'HARD', blurb: 'one touch. a wind-up torch.',
      spawnDelay: 10, chaseSpeed: 8.8, roamSpeed: 2.8, alertSpeed: 6.6, sight: 13, loseTime: 5, searchTime: 8,
      hearing: 1.4,
      noise: { slide: 8, land: 14, rummage: 14, drawer: 34, sprint: 6, walk: 0, wind: 8 },
      attention: 0.6,
      props: 0.5, lockers: 'hard', lockerOnce: true,
      hp: 1, damage: 999, medkits: 0, stamina: 0.85,
      fov: null, crankLight: true, startCharge: 1, chargeBar: true, totals: true,
    },
    nightmare: {
      lighting: 'dark',      // full: the house's lights work | dim: rooms are dark, halls dim | dark: every lamp is dead
      name: 'NIGHTMARE', blurb: 'it is already inside.',
      spawnDelay: 0.6, chaseSpeed: 9.0, roamSpeed: 3.4, alertSpeed: 7.2, sight: 15, loseTime: 8, searchTime: 12,
      hearing: 1.8,
      noise: { slide: 12, land: 18, rummage: 18, drawer: 40, sprint: 10, walk: 4, wind: 12 },
      attention: 0.35,
      props: 0.25, lockers: 'nightmare', lockerOnce: true,
      hp: 1, damage: 999, medkits: 0, stamina: 0.75,
      fov: 60, crankLight: true, startCharge: 0.5, chargeBar: false, totals: false,
    },
  };
  const ORDER = ['easy', 'normal', 'hard', 'nightmare'];
  let id = 'normal';
  try {
    const s = JSON.parse(localStorage.getItem('run-settings') || '{}');
    if (LEVELS[s.difficulty]) id = s.difficulty;
  } catch (e) {}
  // test hook: ?diff=hard in the address
  try { const q = new URLSearchParams(location.search).get('diff'); if (LEVELS[q]) id = q; } catch (e) {}

  return {
    LEVELS, ORDER,
    get id() { return id; },
    get cur() { return LEVELS[id]; },
  };
})();

if (typeof module !== 'undefined') module.exports = Difficulty;
