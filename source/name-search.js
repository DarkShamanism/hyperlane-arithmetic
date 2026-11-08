// Exact source excerpts from nms/voyage/voyage.js, frozen 2026-11-04.
// Reference fragments: omitted base generator and UI helpers remain external.

// Original lines 2668-2765
  // the raw spellings cleanup could have turned into this word: each cleanup step adds at most one vowel
  function nameRawForms(word) {
    const V = NAME_VOWELS, out = new Set();
    const starts = w => { const a = w[0], b = w[1]; const ok = (a === "s" && "hklmnprtwy".includes(b)) || (b === "h" && "ctw".includes(a)) || (b === "l" && "bcfgps".includes(a)) || (b === "r" && "bcdfgkpt".includes(a)) || (b === "w" && "dgt".includes(a)) || (b === "y" && "hmr".includes(a));
      return !V.includes(a) && !V.includes(b) && !ok ? [...V].map(v => w[0] + v + w.slice(1)) : [w]; };
    const ends = w => { const n = w[w.length - 1], r = w[w.length - 2];
      const need = (r !== "g" || V.includes(n)) && ((n === "b" && "gn".includes(r)) || (n === "d" && "bdfghkmpst".includes(r)) || (n === "g" && r === "l") || (n === "p" && "bdhkt".includes(r)) || (n === "r" && "bfg".includes(r)) || (n === "t" && r === "g") || (n === "w" && !V.includes(r)));
      return need ? [...V].map(v => w.slice(0, -1) + v + w.slice(-1)) : [w]; };
    const middles = w => { let t = 0; for (let n = 0; n < w.length; n++) { if (t < 3) t = V.includes(w[n]) ? 0 : t + 1; else { if (!"aeiouy".includes(w[n])) return [1, 2, 3].flatMap(i => [...V].map(v => w.slice(0, n - 3 + i) + v + w.slice(n - 3 + i))); t = 0; } } return [w]; };
    const vowels = [...word].map((c, i) => (V.includes(c) ? i : -1)).filter(i => i >= 0);
    const pick = (from, k) => (k === 0 ? [[]] : from.flatMap((x, j) => pick(from.slice(j + 1), k - 1).map(rest => [x, ...rest])));
    for (let k = 0; k <= Math.min(3, vowels.length); k++) {
      for (const removed of pick(vowels, k)) {
        const raw = [...word].filter((_, i) => !removed.includes(i)).join("");
        if (raw.length >= 3 && starts(raw).flatMap(ends).flatMap(middles).includes(word)) out.add(raw);
      }
    }
    return [...out];
  }
  // what each typed name asks for: its first word, the whole name, and for a first word too long for today's rules, the raw lengths to force
  function nameTargets(text, pre = false, any = false) {
    return text.split(/[\n,;]+/).map(t => t.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 40).map(full => {
      const read = pre ? preReleaseForm(full) : null, form = read ? read.system : full;
      const main = form.split(/[- ]/)[0].toLowerCase(), raws = /^[a-z']{3,}$/.test(main) ? nameRawForms(main) : [];
      const fits = raws.filter(r => (any ? r.length >= 3 : r.length >= 6) && r.length <= 9), long = [...new Set(raws.filter(r => r.length > 9).map(r => r.length))];
      return { full, form, pre: read, main, force: fits.length ? [0] : long.length ? long : null, starts: [...new Set(raws.map(r => r.slice(0, 3)))] };
    });
  }
  // the regions within reach of a place, as a sphere, leaving out the empty core and anything past the galaxy's edge. Walked rather than listed,
  // as the largest spheres hold millions
  function* nameRegions(x, y, z, reach) {
    for (let dy = -Math.min(reach, 2 * MAX_Y); dy <= Math.min(reach, 2 * MAX_Y); dy++) {
      const ry = y + dy;
      if (Math.abs(ry) > MAX_Y) continue;
      for (let dx = -reach; dx <= reach; dx++) {
        const rx = x + dx, room = reach * reach - dx * dx - dy * dy;
        if (Math.abs(rx) > MAX_XZ || room < 0) continue;
        const span = Math.floor(Math.sqrt(room));
        for (let dz = -span; dz <= span; dz++) {
          const rz = z + dz;
          if (Math.abs(rz) > MAX_XZ || Math.trunc(Math.hypot(rx, ry, rz)) < CORE_GAP) continue;
          yield [rx, ry, rz];
        }
      }
    }
  }
  function nameRegionCount(x, y, z, reach) {
    let n = 0;
    for (const _ of nameRegions(x, y, z, reach)) n++;
    return n;
  }
  // every address within reach of a place whose name matches. loose: the first word is enough. Runs in slices so the page keeps drawing
  async function nameSearch({ g, x, y, z, reach, indices, targets, loose }, progress, stopped) {
    const want = new Map();      // group * 8192 + start index -> targets
    for (const t of targets) {
      if (!t.force) continue;
      for (const group of [2, 3, 4, 5, 7]) {
        const list = nameStarts[group];
        for (let k = 0; k < list.length / 3; k++) {
          if (!t.starts.includes(list.substr(k * 3, 3))) continue;
          const key = group * 8192 + k;
          if (!want.has(key)) want.set(key, []);
          want.get(key).push(t);
        }
      }
    }
    const total = nameRegionCount(x, y, z, reach);
    const sizes = nameStarts.map(list => list.length / 3), hits = [], s = [0, 0];
    let started = performance.now(), n = 0;
    for (const [rx, ry, rz] of nameRegions(x, y, z, reach)) {
      n++;
      const region = (((ry & 0xff) << 24) | ((rz & 0xfff) << 12) | (rx & 0xfff)) >>> 0;
      const t = region || 1, rot = ((region << 16) | (region >>> 16)) >>> 0, mix = (region ^ rot) >>> 0;
      for (const index of indices) {
        s[0] = t; s[1] = (((index << 8) | g) ^ mix) >>> 0;
        nameStep(s);
        const p = nameInt(s, 5), group = p < 4 ? p + 2 : 7;
        nameStep(s); nameStep(s);
        const ids = want.get(group * 8192 + nameInt(s, sizes[group]));
        if (!ids) continue;
        for (const target of ids) {
          for (const force of target.force) {
            const name = nameAt(g, region, index, force || undefined);
            if (name.main.toLowerCase() !== target.main) continue;
            const shape = target.form || target.full, today = name.today === shape, older = name.older === shape;
            if (today || older || loose) hits.push({ g, x: rx, y: ry, z: rz, index, target, name: today || !older ? name.today : name.older, exact: today || older, rule: force ? "long" : today && older ? "both" : today ? "today" : older ? "older" : "first word" });
          }
        }
      }
      if (performance.now() - started > 40) {
        if (stopped()) return null;
        progress(n / total, hits.length);
        await new Promise(resolve => setTimeout(resolve, 0));
        started = performance.now();
      }
    }
    return { hits, regions: total };
  }

// Original lines 3561-3644
  // ---- planet names come from each body's own seed, which the map only gets by working out the whole system: about 100 times the cost of a system name.
  // So they confirm system matches, which is cheap, and on their own they're searched only close by ----
  const NAME_PLANET_REACH = 4;          // regions out that planet names alone are searched, about 20 seconds
  const NAME_PLANET_CHECK = 5000;       // the most system matches whose bodies get named
  function planetTargets(text, pre = false, any = false) {
    return text.split(/[\n,;]+/).map(t => t.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 20).map(full => {
      const read = pre ? preReleaseForm(full) : null, word = read ? read.stem : planetWord(full), raws = /^[a-z']{3,}$/.test(word) ? nameRawForms(word) : [];
      return { full, form: read ? nameCap(read.stem) : "", pre: read, lower: full.toLowerCase(), word, spellable: raws.some(r => (any ? r.length >= 3 : r.length >= 4) && (pre || any || r.length <= 10)) };     // planet words are 4 to 10 letters before cleanup
    });
  }
  const describeAt = (g, x, y, z, index) => { const a = api(); return a.describeSystem(new a.UA({ x, y, z, galaxy: g, system: index })); };
  // a system's bodies, named the way the map names them, in the game's planet order
  function bodiesOf(c) {
    const namer = api().db()._nameGenerator;
    return c.seeds.map(seed => { try { return namer.planetNameFromSeed(seed); } catch { return ""; } });
  }
  const planetWord = name => name.replace(/^new\s+/i, "").split(" ")[0].toLowerCase();
  // which bodies match a typed planet, each with its place in the system, which is the first portal glyph. loose: the first word is enough.
  // body: "planet" or "moon" to accept only that kind
  function bodyMatches(c, bodies, targets, loose, body) {
    const found = [];
    bodies.forEach((b, i) => {
      const moon = !!c.isMoon[i];
      if (body && (body === "moon") !== moon) return;
      for (const t of targets) if (b.toLowerCase() === t.lower || (loose && planetWord(b) === t.word)) found.push({ t, i, moon });
    });
    return found;
  }
  function setBodies(h, c, targets, loose, body) {
    h.bodies = bodiesOf(c);
    h.moons = c.isMoon.map(Boolean);
    h.bodyHits = bodyMatches(c, h.bodies, targets, loose, body);
    h.planets = [...new Set(h.bodyHits.map(m => m.t))];
  }
  async function nameBodies(hits, targets, loose, body, most = NAME_PLANET_CHECK) {
    const list = hits.slice(0, most);
    names.naming = list.length;
    let started = performance.now();
    for (let i = 0; i < list.length; i++) {
      if (names.stopped) break;
      const h = list[i];
      setBodies(h, describeAt(h.g, h.x, h.y, h.z, h.index), targets, loose, body);
      if (performance.now() - started > 40) {
        names.progress = i / list.length;
        const line = $("vy-name-status");
        if (line) line.textContent = nameStatus();
        await new Promise(resolve => setTimeout(resolve, 0));
        started = performance.now();
      }
    }
    names.naming = 0;
  }
  // after a stop part-way through naming planets: keep the systems that were checked, and say how many weren't
  function keepNamed(r) {
    const before = r.hits.length;
    r.hits = r.hits.filter(h => h.bodies);
    r.planetUnchecked = before - r.hits.length;
  }
  // a match's portal code, landing on the first body that matched, or else planet 1
  const nameCode = h => `${h.bodyHits && h.bodyHits.length ? (h.bodyHits[0].i + 1).toString(16).toUpperCase() : "1"}${placeCode(h).slice(1)}`;
  // planet names on their own: every system within reach worked out in full
  async function planetSearch({ g, x, y, z, reach, indices, targets, loose, details, body }, progress, stopped) {
    const a = api(), total = nameRegionCount(x, y, z, reach), hits = [];
    let started = performance.now(), n = 0;
    for (const [rx, ry, rz] of nameRegions(x, y, z, reach)) {
      n++;
      for (const index of indices) {
        const c = describeAt(g, rx, ry, rz, index);
        if (detailMisses(c, details).length) continue;      // naming the bodies is the slow part, so the details go first
        const h = { g, x: rx, y: ry, z: rz, index, target: null, exact: true, rule: "planet" };
        setBodies(h, c, targets, loose, body);
        if (!h.planets.length) continue;
        try { h.name = a.db()._nameGenerator.systemNameFromUA(new a.UA({ x: rx, y: ry, z: rz, galaxy: g, system: index })); } catch { h.name = `System 0x${hex3(index)}`; }
        hits.push(h);
      }
      if (performance.now() - started > 40) {
        if (stopped()) return null;
        progress(n / total, hits.length);
        await new Promise(resolve => setTimeout(resolve, 0));
        started = performance.now();
      }
    }
    return { hits, regions: total };
  }

