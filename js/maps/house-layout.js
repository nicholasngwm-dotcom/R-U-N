// House map layout — pure data, no three.js (so it can be checked/tested on its own).
// A two-storey family house with a walled back garden. Two grids of 1.5 m cells, one per floor.
// North (row 0) is the back garden, the front door is in the south wall.
//
// Both floors:
//   #  wall            .  floor            D  doorway (lintel 2.8 m)
//   V  crawl vent in a wall (crouch / slide through)      H  broken hole in a wall (vault through)
//   S  chest of drawers (search it)       X  locker (hide inside)
//   b  bookshelf 2.1 m (climb)  k  counter 1.0 m (vault)  w  wardrobe 2.4 m  g  grandfather clock
//   t  tall side table (slide under)      l  low coffee table (step up)      q  potted plant
//   n  piano   j  table 0.8 m (vault)     f  sofa         F  fireplace
//   B  bed     c  toilet    u  bathtub    i  sink         e  stove          r  fridge
// Ground floor only:
//   s  grand staircase (18 steps of 0.3 m, rising north)    E  front door (3 padlocks + a code)
//   d  the opening of the cellar stairs (railed off, step down from its south side)
//   y  garden (grass)   Z  garden wall 3.6 m    h  hedge 2.4 m    T  tree    G  gravestone (vault)
//   o  the well         L  ladder up the back of the house to the bedroom window above
// Basement only:
//   z  steep cellar stairs (9 steps of 0.4 m, rising south up to the laundry)
//   C  the old car      K  workbench (build the crank handle here)    p  concrete pillar
//   Q  the garage door (rusted shut)
// Upper floor only:
//   (space) nothing — open sky over the garden          _  open to the hall below (balustrade at the edge)
//   O  broken floor — you fall through to the room below
//   v  floor vent: crawl in and drop down the shaft to the room below
//   W  bedroom window at the top of the garden ladder (climb in / drop out)
const HouseLayout = (function () {
  const W = 36, H = 44, CELL = 1.5;
  const STOREY = 5.4;             // floor-to-floor height (ceilings at 5.1: the entity is ~4.6 m tall)
  const BASEMENT = -3.6;          // basement floor height (ceiling at -0.5: the entity has to crawl down there)
  const mk = fill => { const g = []; for (let r = 0; r < H; r++) g.push(new Array(W).fill(fill)); return g; };
  const g0 = mk('#'), g1 = mk(' '), g2 = mk(' ');
  const set = (g, c, r, ch) => { if (c >= 0 && c < W && r >= 0 && r < H) g[r][c] = ch; };
  const rect = (g, c0, r0, c1, r1, ch) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) set(g, c, r, ch); };
  const cells = (g, list, ch) => list.forEach(([c, r]) => set(g, c, r, ch));

  // =====================================================================
  // GROUND FLOOR
  // =====================================================================
  // ---------- the back garden (open sky, walled in) ----------
  rect(g0, 0, 0, W - 1, 17, 'Z');
  rect(g0, 1, 1, W - 2, 17, 'y');

  // ---------- rooms ----------
  rect(g0, 1, 19, 8, 29, '.');     // study
  rect(g0, 10, 19, 14, 23, '.');   // downstairs toilet
  rect(g0, 10, 25, 14, 29, '.');   // laundry
  rect(g0, 16, 19, 19, 30, '.');   // back hall (opens into the foyer)
  rect(g0, 21, 19, 34, 29, '.');   // kitchen
  rect(g0, 1, 31, 11, 42, '.');    // living room
  rect(g0, 13, 31, 22, 42, '.');   // foyer (double height, grand staircase)
  rect(g0, 24, 31, 34, 42, '.');   // dining room

  // ---------- connections ----------
  cells(g0, [[4, 30], [5, 30]], 'D');                 // study <-> living room
  set(g0, 9, 27, 'D'); set(g0, 9, 21, 'V');            // study <-> laundry / toilet (vent)
  set(g0, 15, 21, 'D'); set(g0, 15, 27, 'D');          // hall <-> toilet / laundry
  cells(g0, [[20, 23], [20, 24]], 'D'); set(g0, 20, 28, 'H');   // hall <-> kitchen
  cells(g0, [[28, 30], [29, 30]], 'D'); set(g0, 33, 30, 'V');   // kitchen <-> dining
  cells(g0, [[12, 31], [12, 32]], 'D'); set(g0, 12, 42, 'H');   // foyer <-> living room
  cells(g0, [[23, 36], [23, 37]], 'D'); set(g0, 23, 40, 'V');   // foyer <-> dining
  cells(g0, [[17, 18], [18, 18]], 'D');               // back door: hall -> garden
  set(g0, 31, 18, 'D');                                // kitchen door -> garden
  cells(g0, [[17, 43], [18, 43]], 'E');                // the front door

  // ---------- grand staircase: west side of the foyer, rising north to the gallery ----------
  const stairs = { c0: 13, c1: 15, rBottom: 41, rTop: 33, steps: 18, rise: 0.3 };
  rect(g0, stairs.c0, stairs.rTop, stairs.c1, stairs.rBottom, 's');

  // ---------- furniture ----------
  // study
  rect(g0, 1, 21, 1, 27, 'b'); set(g0, 4, 19, 'F'); cells(g0, [[5, 23], [6, 23]], 'j');
  // downstairs toilet
  set(g0, 14, 19, 'c'); set(g0, 12, 19, 'i');
  // laundry (+ the way down to the cellar)
  rect(g0, 11, 29, 13, 29, 'k');
  rect(g0, 12, 25, 13, 27, 'd');
  // back hall
  set(g0, 16, 19, 'g'); set(g0, 19, 26, 't');
  // kitchen
  rect(g0, 21, 19, 23, 19, 'k'); set(g0, 24, 19, 'e'); rect(g0, 25, 19, 27, 19, 'k'); set(g0, 34, 19, 'r');
  rect(g0, 25, 23, 28, 24, 'k');                       // island
  rect(g0, 31, 26, 32, 27, 'j');                       // kitchen table
  // living room
  set(g0, 1, 36, 'F'); rect(g0, 4, 35, 4, 38, 'f'); cells(g0, [[2, 36], [2, 37]], 'l');
  cells(g0, [[7, 32], [8, 32]], 'n'); set(g0, 11, 41, 'q'); set(g0, 1, 31, 'b'); set(g0, 9, 42, 't');
  // foyer
  set(g0, 22, 41, 'g'); set(g0, 22, 31, 'q'); set(g0, 22, 38, 'q');
  // dining room
  rect(g0, 27, 34, 31, 38, 'j'); set(g0, 34, 31, 'g');

  // ---------- garden ----------
  set(g0, 17, 8, 'o');                                                     // the well
  rect(g0, 6, 5, 6, 12, 'h'); rect(g0, 28, 5, 28, 12, 'h');                // hedges
  rect(g0, 10, 13, 14, 13, 'h'); rect(g0, 21, 13, 25, 13, 'h');
  rect(g0, 10, 3, 14, 3, 'h'); rect(g0, 21, 3, 25, 3, 'h');
  cells(g0, [[3, 3], [32, 3], [10, 9], [24, 9], [3, 15], [33, 15]], 'T'); // dead trees
  cells(g0, [[30, 7], [32, 7], [30, 9], [32, 9], [31, 11]], 'G');          // the family plot
  set(g0, 4, 17, 'L');                                                     // ladder up to the bedroom window

  // =====================================================================
  // UPPER FLOOR
  // =====================================================================
  rect(g1, 0, 18, W - 1, H - 1, '#');
  rect(g1, 1, 19, 8, 29, '.');     // small bedroom (window onto the garden)
  rect(g1, 10, 19, 14, 23, '.');   // bathroom
  rect(g1, 10, 25, 14, 29, '.');   // reading nook
  rect(g1, 16, 19, 19, 30, '.');   // upstairs hall
  rect(g1, 21, 19, 34, 29, '.');   // upstairs sitting room
  rect(g1, 13, 31, 22, 32, '.');   // gallery over the foyer
  rect(g1, 13, 33, 22, 42, '_');   // ...open down to the foyer
  rect(g1, 1, 31, 11, 42, '.');    // master bedroom
  rect(g1, 1, 31, 4, 34, '.');     // ...ensuite (walls below)
  rect(g1, 5, 31, 5, 34, '#'); rect(g1, 1, 35, 5, 35, '#');
  rect(g1, 24, 31, 34, 42, '.');   // guest bedroom

  // ---------- connections ----------
  set(g1, 15, 21, 'D');                                       // hall <-> bathroom
  cells(g1, [[15, 26], [15, 27], [15, 28]], '.');             // hall <-> nook (open)
  set(g1, 9, 27, 'D'); set(g1, 9, 21, 'V');                   // small bedroom <-> nook / bathroom (vent)
  cells(g1, [[20, 23], [20, 24]], 'D');                       // hall <-> sitting room
  cells(g1, [[12, 31], [12, 32]], 'D');                       // gallery <-> master bedroom
  cells(g1, [[23, 31], [23, 32]], 'D');                       // gallery <-> guest bedroom
  set(g1, 28, 30, 'H');                                       // sitting room <-> guest bedroom (hole)
  set(g1, 5, 33, 'D');                                        // master <-> ensuite
  set(g1, 4, 18, 'W');                                        // window over the garden ladder

  // ---------- ways down that the entity can't follow ----------
  cells(g1, [[19, 22], [29, 25], [8, 39]], 'O');              // rotten floor: fall through
  cells(g1, [[10, 19], [34, 42], [1, 19], [21, 29]], 'v');    // floor vents: drop down the shaft

  // ---------- furniture ----------
  // small bedroom
  cells(g1, [[7, 19], [7, 20]], 'B'); set(g1, 8, 19, 'S'); set(g1, 3, 29, 'S'); cells(g1, [[1, 24], [1, 25]], 'w'); set(g1, 6, 29, 'j');
  // bathroom
  cells(g1, [[13, 19], [14, 19]], 'u'); set(g1, 10, 23, 'c'); set(g1, 14, 23, 'i');
  // nook
  set(g1, 10, 29, 'S'); set(g1, 12, 29, 'b'); set(g1, 14, 29, 'b');
  // upstairs hall
  set(g1, 16, 20, 'S'); set(g1, 19, 19, 'g');
  // sitting room
  set(g1, 28, 19, 'F'); rect(g1, 26, 22, 30, 22, 'f'); cells(g1, [[27, 20], [28, 20]], 'l');
  rect(g1, 34, 22, 34, 26, 'b'); set(g1, 21, 19, 'S'); set(g1, 34, 19, 'q'); cells(g1, [[31, 28], [32, 28]], 'j');
  // master bedroom
  rect(g1, 10, 37, 11, 38, 'B'); cells(g1, [[11, 36], [11, 39]], 'S'); set(g1, 6, 42, 'S');
  cells(g1, [[1, 41], [1, 42]], 'w'); set(g1, 1, 38, 'F'); set(g1, 7, 36, 'q');
  // ensuite
  cells(g1, [[1, 31], [2, 31]], 'u'); set(g1, 4, 31, 'c'); set(g1, 1, 34, 'i');
  // guest bedroom
  cells(g1, [[29, 41], [30, 41]], 'B'); cells(g1, [[29, 42], [30, 42]], 'B'); cells(g1, [[28, 42], [31, 42]], 'S');
  cells(g1, [[34, 31], [34, 32]], 'w'); set(g1, 24, 38, 'S'); set(g1, 33, 35, 'j');

  // =====================================================================
  // BASEMENT: a garage with the old car, and a workshop
  // =====================================================================
  rect(g2, 2, 16, 21, 25, '#');
  rect(g2, 3, 17, 20, 24, '.');
  rect(g2, 11, 25, 14, 28, '#');
  rect(g2, 12, 25, 13, 27, 'z');                       // cellar stairs, rising south to the laundry
  cells(g2, [[2, 19], [2, 20], [2, 21]], 'Q');         // the garage door (rusted shut)
  rect(g2, 5, 19, 6, 22, 'C');                         // the car
  rect(g2, 15, 17, 19, 17, 'K');                       // the workbench along the north wall
  cells(g2, [[9, 19], [9, 22], [14, 20]], 'p');        // pillars holding the house up
  rect(g2, 20, 19, 20, 22, 'b');                       // shelves of jars and tins
  rect(g2, 3, 24, 5, 24, 'b');
  set(g2, 20, 24, 'X'); set(g2, 10, 17, 'S'); set(g2, 3, 17, 'S');
  const cellar = { c0: 12, c1: 13, lowRow: 25, highRow: 27, steps: 9, rise: 0.4 };

  // ---------- searchable drawers + lockers on the ground floor / garden ----------
  cells(g0, [[8, 25], [1, 29], [14, 25], [16, 24], [34, 24], [11, 38], [1, 42], [22, 35], [34, 36], [29, 42], [1, 10], [34, 4]], 'S');
  cells(g0, [[10, 25], [19, 29], [6, 42]], 'X');
  cells(g1, [[10, 25], [34, 29], [16, 29]], 'X');

  // =====================================================================
  // zones: wallpaper + floor per room (landmarks for finding your way)
  // =====================================================================
  const Z = (f, name, c0, r0, c1, r1, wall, floor, extra = {}) => Object.assign({ f, name, c0, r0, c1, r1, wall, floor }, extra);
  const zones = [
    Z(0, 'garden', 1, 1, 34, 17, 'outside', 'grass', { outdoor: true }),
    Z(0, 'study', 1, 19, 8, 29, 'library', 'darkwood'),
    Z(0, 'toilet', 10, 19, 14, 23, 'bath', 'tile'),
    Z(0, 'laundry', 10, 25, 14, 29, 'servant', 'boards'),
    Z(0, 'kitchen', 21, 19, 34, 29, 'kitchen', 'checker'),
    Z(0, 'living room', 1, 31, 11, 42, 'living', 'parquet'),
    Z(0, 'foyer', 13, 31, 22, 42, 'foyer', 'marble', { hall: true }),
    Z(0, 'dining room', 24, 31, 34, 42, 'dining', 'wood'),
    Z(1, 'small bedroom', 1, 19, 8, 29, 'kids', 'boards', { bedroom: true }),
    Z(1, 'bathroom', 10, 19, 14, 23, 'bath', 'tile'),
    Z(1, 'nook', 10, 25, 14, 29, 'library', 'wood'),
    Z(1, 'sitting room', 21, 19, 34, 29, 'lounge', 'parquet'),
    Z(1, 'gallery', 13, 31, 22, 42, 'foyer', 'darkwood', { hall: true }),
    Z(1, 'ensuite', 1, 31, 4, 34, 'bath', 'tile', { bedroom: 'master bedroom' }),
    Z(1, 'master bedroom', 1, 31, 11, 42, 'bedroom', 'wood', { bedroom: true }),
    Z(1, 'guest bedroom', 24, 31, 34, 42, 'guest', 'wood', { bedroom: true }),
    Z(2, 'basement', 3, 17, 20, 28, 'concrete', 'concrete'),
  ];
  const hall = { name: 'hall', wall: 'hall', floor: null, hall: true };

  // chandeliers: [col, row, floor, flickers?]
  const lights = [
    [4.5, 24, 0], [12, 21, 0], [12, 27, 0, true], [17.5, 22, 0], [17.5, 28, 0], [27.5, 22, 0], [30, 27, 0],
    [6, 36.5, 0], [17.5, 36.5, 0], [29, 36, 0, true],
    [4.5, 24, 1, true], [12, 21, 1], [12, 27, 1], [17.5, 21, 1], [17.5, 27, 1, true], [27.5, 24, 1],
    [7, 38, 1], [2.5, 33, 1, true], [29, 36.5, 1], [17.5, 31.5, 1],
    [7, 20.5, 2, true], [17, 19.5, 2], [12, 23, 2, true],          // bare bulbs in the basement
  ];
  // lanterns in the garden: [col, row]
  const lanterns = [[17, 10], [17.5, 16.5], [8, 16]];

  // carpet runners down the halls, rugs in rooms (cell rects, per floor)
  const runners = [{ f: 0, c0: 16, r0: 19, c1: 19, r1: 30 }, { f: 1, c0: 16, r0: 19, c1: 19, r1: 30 }];
  const rugs = [
    { f: 0, c0: 2, r0: 34, c1: 7, r1: 39 }, { f: 0, c0: 17, r0: 33, c1: 21, r1: 40 }, { f: 0, c0: 26, r0: 33, c1: 32, r1: 39 },
    { f: 1, c0: 7, r0: 35, c1: 11, r1: 40 }, { f: 1, c0: 25, r0: 21, c1: 31, r1: 23 }, { f: 1, c0: 26, r0: 38, c1: 33, r1: 42 },
  ];

  // ---------- things you can pick up and throw: [type, col, row, floor, yaw, on] ----------
  const props = [
    // dining chairs around the table
    ['chair', 26, 35, 0, Math.PI / 2], ['chair', 26, 37, 0, Math.PI / 2], ['chair', 32, 35, 0, -Math.PI / 2], ['chair', 32, 37, 0, -Math.PI / 2],
    ['chair', 29, 33, 0, 0], ['chair', 29, 39, 0, Math.PI],
    ['chair', 30, 25.4, 0, 0.3], ['chair', 33, 26.5, 0, -1.7], ['chair', 5.5, 24, 0, Math.PI],       // kitchen, study
    ['chair', 6, 28, 1, 0.4], ['chair', 32, 29, 1, Math.PI + 0.4], ['chair', 32.5, 36, 1, -1.4],    // upstairs
    ['chair', 8.5, 34, 0, 2.4], ['chair', 18, 24, 1, 1.1], ['chair', 17, 19, 2, 2.8],
    // vases
    ['vase', 21.4, 33.4, 0], ['vase', 13.6, 31.3, 0], ['vase', 16.4, 21, 0], ['vase', 10.5, 40, 0], ['vase', 33.6, 41.5, 0],
    ['vase', 24.5, 28.5, 0], ['vase', 16.5, 28, 1], ['vase', 22, 31.4, 1], ['vase', 2.5, 40.5, 1], ['vase', 24.5, 20, 1],
    ['vase', 15, 9, 0], ['vase', 20, 6.5, 0], ['vase', 2, 12, 0], ['vase', 11, 23.6, 2],
  ].map(([type, c, r, f, yaw = 0]) => ({ type, c, r, f, yaw }));

  const spawn = { c: 17.5, r: 41, f: 0, yaw: 0 };        // in the foyer, facing up the hall
  const entitySpawn = { c: 17.5, r: 20, f: 1 };          // upstairs, at the far end of the hall

  return {
    W, H, CELL, STOREY, BASEMENT,
    floorY: [0, STOREY, BASEMENT],
    floors: [g0.map(row => row.join('')), g1.map(row => row.join('')), g2.map(row => row.join(''))],
    stairs, cellar,
    // every staircase in one form: cells on floor f, low end at lowRow, high end at highRow which joins floor `upper`
    stairsList: [
      { f: 0, upper: 1, ch: 's', c0: stairs.c0, c1: stairs.c1, lowRow: stairs.rBottom, highRow: stairs.rTop, steps: stairs.steps, rise: stairs.rise },
      { f: 2, upper: 0, ch: 'z', c0: cellar.c0, c1: cellar.c1, lowRow: cellar.lowRow, highRow: cellar.highRow, steps: cellar.steps, rise: cellar.rise },
    ],
    zones, hall, lights, lanterns, runners, rugs, props, spawn, entitySpawn,
  };
})();

if (typeof module !== 'undefined') module.exports = HouseLayout;
