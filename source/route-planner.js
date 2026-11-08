// Exact source excerpts from nms/voyage/voyage.js, frozen 2026-11-04.
// Reference fragments: omitted base generator and UI helpers remain external.

// Original lines 1566-1693
  const starPlace = star => ({ x: star.x, y: star.y, z: star.z, index: parseInt(star.portal.slice(1, 4), 16) });
  const sameStar = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z && a.index === b.index;
  const warpsBetween = (a, b, range) => (sameStar(a, b) ? 0 : Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * LY_PER_REGION / range)));

  // the regions a warp leg stops in, ending at b. Stops have to be whole regions, so each is whichever region close to the line gets farthest along it while still in range.
  // A range under one region's width still gets a stop per region, because an address can't say which stars inside one are close enough
  function warpLine(a, b, range) {
    const gap = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) * LY_PER_REGION, reach = Math.max(range, LY_PER_REGION), stops = [];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, span = Math.hypot(dx, dy, dz);
    const along = p => ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / span;
    let at = a;
    while (gap(at, b) > reach) {
      const ideal = (along(at) + reach / LY_PER_REGION) / span, cx = Math.round(a.x + dx * ideal), cy = Math.round(a.y + dy * ideal), cz = Math.round(a.z + dz * ideal);
      let next = null, farthest = -Infinity, closest = Infinity;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          for (let k = -2; k <= 2; k++) {
            const c = { x: cx + i, y: cy + j, z: cz + k };
            if (Math.abs(c.x) > MAX_XZ || Math.abs(c.y) > MAX_Y || Math.abs(c.z) > MAX_XZ || gap(at, c) > reach || gap(c, b) >= gap(at, b)) continue;
            const s = along(c), off = Math.hypot(c.x - a.x - dx * s / span, c.y - a.y - dy * s / span, c.z - a.z - dz * s / span);
            if (off > ROUTE_STOP_ASIDE) continue;
            if (s > farthest + 1e-9 || (s > farthest - 1e-9 && off < closest)) { next = c; farthest = s; closest = off; }
          }
        }
      }
      if (!next) {     // too short a range to follow the line, so one region along whichever axis has farthest to go
        const off = [b.x - at.x, b.y - at.y, b.z - at.z], sizes = off.map(Math.abs), axis = sizes.indexOf(Math.max(...sizes));
        next = { x: at.x + (axis === 0 ? Math.sign(off[0]) : 0), y: at.y + (axis === 1 ? Math.sign(off[1]) : 0), z: at.z + (axis === 2 ? Math.sign(off[2]) : 0) };
      }
      stops.push(next);
      at = next;
    }
    stops.push(b);
    return stops;
  }
  // a leg that would cross the empty core goes around it, past one corner beside the core
  function warpLeg(a, b, range) {
    if (sameStar(a, b)) return [];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, along = -(a.x * dx + a.y * dy + a.z * dz) / (dx * dx + dy * dy + dz * dz || 1);
    const near = [a.x + dx * along, a.y + dy * along, a.z + dz * along], miss = Math.hypot(...near), flat = Math.hypot(dx, dz);
    let stops;
    if (along > 0 && along < 1 && miss < CORE_GAP + 2) {
      const side = miss > 0.5 ? near.map(n => n / miss) : flat ? [-dz / flat, 0, dx / flat] : [1, 0, 0];
      const corner = { x: Math.round(side[0] * (CORE_GAP + 6)), y: Math.round(side[1] * (CORE_GAP + 6)), z: Math.round(side[2] * (CORE_GAP + 6)) };
      stops = [...warpLine(a, corner, range), ...warpLine(corner, b, range)];
    } else stops = warpLine(a, b, range);
    return stops.filter(stop => stop === b || !inCoreGap(stop));
  }

  // Closer to the core than exits can be calculated, the recorded jumps still moved inward by a set amount, on a bearing nothing here can say. That can still pay off when the
  // destination is nearer the core than you are, as long as the worst landing, on the far side of the destination's circle around the core, beats warping from here
  function deepStretch(at, to, range) {
    const there = Math.max(Math.hypot(to.x, to.y, to.z), CORE_GAP), jumps = Math.ceil((Math.hypot(at.x, at.y, at.z) - there) / DEEP_JUMP_REGIONS), last = Math.max(1, Math.ceil(2 * there * LY_PER_REGION / range));
    return jumps < 1 || last >= warpsBetween(at, to, range) ? null : { type: "deep", from: at, to, jumps, warps: jumps + last, lastWarps: last };
  }

  // A warp counts once per range of distance, and a jump counts as one more. Each landing tries every black hole within about a warp, since each has its own exit,
  // and keeps the landings that leave the fewest warps to go. onDepth can return false to give up. flown holds exits really taken, which are used over any calculation
  // Forced, it takes whichever landing ends up closest to the destination, even if that costs more moves than warping, and only tries black holes one warp away.
  // Wide, it looks much farther, since more black holes means more exits to choose from, and takes the fewest moves that still land closer than where you started
  async function searchRoute(g, from, to, range, allowGuess, flown, onDepth, force = false, wide = false) {
    const reach = wide ? ROUTE_WIDE_REACH : force ? Math.max(0, Math.min(8, Math.floor(range / LY_PER_REGION))) : Math.min(8, Math.max(3, Math.ceil(range / LY_PER_REGION))), high = Math.min(reach, 4), direct = warpsBetween(from, to, range);
    const away = p => Math.hypot(p.x - to.x, p.y - to.y, p.z - to.z), startAway = away(from);
    const better = state => (wide ? away(state.at) < startAway - 1 && state.total < bestTotal : force ? away(state.at) < bestAway - 1 : state.total < bestTotal);
    let best = null, bestTotal = wide ? Infinity : direct, bestAway = startAway, stalled = 0, frontier = [{ at: from, warps: 0, jumps: 0, parent: null }];
    for (let depth = 1; depth <= ROUTE_MAX_JUMPS && stalled < ROUTE_STALL && frontier.length; depth++) {
      const pool = [];
      for (const state of frontier) {
        const { x, y, z } = state.at;
        for (let dy = -high; dy <= high; dy++) {
          for (let dx = -reach; dx <= reach; dx++) {
            for (let dz = -reach; dz <= reach; dz++) {
              if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
              const hx = x + dx, hy = y + dy, hz = z + dz;
              if (Math.abs(hx) > MAX_XZ || Math.abs(hy) > MAX_Y || Math.abs(hz) > MAX_XZ) continue;
              const radius = Math.hypot(hx, hy, hz);
              if (radius < CORE_GAP) continue;
              let exit = flown.get(`${hx},${hy},${hz}`), kind = "flown";
              if (!exit) {
                if (radius <= EXIT_FAILS_REGIONS || (radius < EXIT_TESTED_REGIONS && !allowGuess)) continue;
                exit = blackHoleExit(g, hx, hy, hz);
                if (!exit) continue;
                kind = radius >= EXIT_TESTED_REGIONS ? "calculated" : "guess";
              }
              const hole = { x: hx, y: hy, z: hz, index: BLACK_HOLE_INDEX }, warps = state.warps + warpsBetween(state.at, hole, range), jumps = state.jumps + 1;
              pool.push({ at: exit, hole, kind, warps, jumps, total: warps + jumps + warpsBetween(exit, to, range), parent: state });
            }
          }
        }
      }
      pool.sort(force && !wide ? (a, b) => away(a.at) - away(b.at) || a.total - b.total : (a, b) => a.total - b.total || a.jumps - b.jumps);
      const pick = wide ? pool.find(better) : pool.length && better(pool[0]) ? pool[0] : null;
      if (pick) { best = pick; bestTotal = best.total; bestAway = away(best.at); stalled = 0; } else stalled++;
      const seen = new Set();
      frontier = [];
      for (const state of pool) {
        const where = `${state.at.x},${state.at.y},${state.at.z}`;
        if (seen.has(where)) continue;
        seen.add(where);
        frontier.push(state);
        if (frontier.length === ROUTE_BEAM) break;
      }
      if (onDepth && (await onDepth(depth, bestTotal)) === false) return null;
    }
    const chain = [];
    for (let state = best; state; state = state.parent) if (state.hole) chain.unshift(state);
    const leg = (a, b) => { const stops = warpLeg(a, b, range); return { type: "warp", from: a, to: b, stops, warps: Math.max(stops.length, warpsBetween(a, b, range)) }; };
    const lay = (states, deep) => {
      const steps = [];
      let at = from;
      for (const state of states) {
        if (!sameStar(at, state.hole)) steps.push(leg(at, state.hole));
        steps.push({ type: "jump", from: state.hole, to: state.at, kind: state.kind });
        at = state.at;
      }
      const stretch = deep && deepStretch(at, to, range);
      if (stretch) steps.push(stretch);
      else if (!sameStar(at, to)) steps.push(leg(at, to));
      return steps;
    };
    // counted again from the real stops, which rounding can make longer than the search's estimate
    const warpCount = steps => steps.reduce((n, step) => n + (step.warps || 0), 0), jumpCount = steps => steps.reduce((n, step) => n + (step.type === "jump" ? 1 : step.jumps || 0), 0);
    let steps = lay(chain, force);
    const straight = lay([], false);
    if (!force && chain.length && warpCount(steps) + chain.length >= warpCount(straight)) steps = straight;
    const warps = warpCount(steps), jumps = jumpCount(steps);
    return { g, from, to, range, direct: warpCount(straight), total: warps + jumps, warps, jumps, steps, forced: force, widened: wide };
  }

// Original lines 1763-1933
  const legOf = (a, b, range) => { const stops = warpLeg(a, b, range); return { type: "warp", from: a, to: b, stops, warps: Math.max(stops.length, warpsBetween(a, b, range)) }; };
  // the stretch where exits can't be calculated, counting the warp before each jump: every region has a black hole, so each warp can go up to its reach inward
  function deepOnly(at, to, range, same = false) {
    const there = Math.max(Math.hypot(to.x, to.y, to.z), CORE_GAP), gain = DEEP_JUMP_REGIONS + (same ? 0 : Math.max(0, Math.floor(range / LY_PER_REGION) - 0.5));
    const jumps = Math.ceil((Math.hypot(at.x, at.y, at.z) - there) / gain), last = Math.max(1, Math.ceil(2 * there * LY_PER_REGION / range));
    if (jumps < 1) return null;
    return { type: "deep", from: at, to, jumps, warps: jumps + last, lastWarps: last, gain, rule: same ? "In each region you land in, warp to its own black hole (system 079) and jump" : `In each region you land in, warp to the black hole farthest in towards the core that is still within ${num(range)} ly (every region has one at system 079) and jump` };
  }
  async function searchOnly(g, from, to, range, flown, onDepth, same = false) {
    const reach = same ? 0 : Math.max(1, Math.min(8, Math.floor(range / LY_PER_REGION))), high = Math.min(reach, 4);     // same: Black hole exit, only the region you land in, so the chain has no choices
    const there = Math.hypot(to.x, to.y, to.z), deep = there <= EXIT_FAILS_REGIONS, nearEnough = range / LY_PER_REGION;
    const away = p => Math.hypot(p.x - to.x, p.y - to.y, p.z - to.z), score = p => (deep ? Math.hypot(p.x, p.y, p.z) : away(p));
    const done = p => (deep ? Math.hypot(p.x, p.y, p.z) <= EXIT_FAILS_REGIONS : away(p) <= nearEnough);
    const offsets = [], flownAt = new Map(), placeKey = (x, y, z) => (x + 2048) * 1048576 + (y + 128) * 4096 + (z + 2048);
    for (let dy = -high; dy <= high; dy++) for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) if (Math.hypot(dx, dy, dz) * LY_PER_REGION <= range) offsets.push(dx, dy, dz);      // one warp, between region centres
    for (const [where, exit] of flown) { const [x, y, z] = where.split(",").map(Number); flownAt.set(placeKey(x, y, z), exit); }
    const steer = same && !deep, cost = s => (steer ? 2 * s.cycles + warpsBetween(s.at, to, range) : score(s.at));      // Black hole exit can't aim, so it follows its chain to wherever warping the rest costs least
    let frontier = [{ at: from, cycles: 0, parent: null, hole: null }], best = frontier[0], bestScore = cost(best), stalled = 0;
    for (let depth = 1; depth <= ROUTE_MAX_JUMPS && frontier.length && !done(best.at); depth++) {
      const pool = new Map();
      for (const state of frontier) {
        const { x, y, z } = state.at;
        for (let i = 0; i < offsets.length; i += 3) {
          const hx = x + offsets[i], hy = y + offsets[i + 1], hz = z + offsets[i + 2];
          if (Math.abs(hx) > MAX_XZ || Math.abs(hy) > MAX_Y || Math.abs(hz) > MAX_XZ) continue;
          const radius = Math.hypot(hx, hy, hz);
          if (radius < CORE_GAP) continue;
          let exit = flownAt.get(placeKey(hx, hy, hz)), kind = "flown";
          if (!exit) {
            if (radius <= EXIT_FAILS_REGIONS) continue;
            exit = blackHoleExit(g, hx, hy, hz);
            if (!exit) continue;
            kind = radius >= EXIT_TESTED_REGIONS ? "calculated" : "guess";
          }
          const key = placeKey(exit.x, exit.y, exit.z);
          if (!pool.has(key)) pool.set(key, { at: exit, hole: { x: hx, y: hy, z: hz, index: BLACK_HOLE_INDEX }, kind, cycles: depth, parent: state });
        }
      }
      frontier = [...pool.values()].sort((a, b) => score(a.at) - score(b.at)).slice(0, ONLY_BEAM);
      if (frontier.length && cost(frontier[0]) < bestScore - 1e-9) { best = frontier[0]; bestScore = cost(best); stalled = 0; } else stalled++;
      if (stalled >= ROUTE_STALL && !(steer && frontier.length && Math.hypot(frontier[0].at.x, frontier[0].at.y, frontier[0].at.z) > there - 20)) break;
      if (onDepth && (await onDepth(depth, best.cycles)) === false) return null;
    }
    const chain = [], steps = [];
    for (let s = best; s && s.hole; s = s.parent) chain.unshift(s);
    let at = from, warps = 0, jumps = 0, tail = 0;
    for (const s of chain) {
      if (!sameStar(at, s.hole)) { const l = legOf(at, s.hole, range); steps.push(l); warps += l.warps; }
      steps.push({ type: "jump", from: s.hole, to: s.at, kind: s.kind });
      jumps++;
      at = s.at;
    }
    if (!sameStar(at, to)) {
      const stretch = deep ? deepOnly(at, to, range, same) : null;
      if (stretch) { steps.push(stretch); warps += stretch.warps; jumps += stretch.jumps; }
      else { const l = legOf(at, to, range); steps.push(l); warps += l.warps; tail = l.warps; }
    }
    const direct = sameStar(from, to) ? 0 : legOf(from, to, range).warps;
    return { g, from, to, range, direct, total: warps + jumps, warps, jumps, steps, forced: true, widened: false, only: true, same, tail };
  }

  // ---- ending a route by black hole: Region Exit and System Exit ----
  // Nothing can be solved for, as an exit's bearing is whatever the black hole's address gives. So this walks every black hole the right distance from the core, the shell that the
  // jump's 13.25 to 16.75 regions inward could bring to the destination, and keeps those that land there. A region is about one ring-cell in a few thousand, so it reads each stream only as far as it needs
  const exitsFound = new Map();
  async function exitsInto(g, to, onBatch) {
    const key = `${g}:${to.x},${to.y},${to.z}`;
    if (exitsFound.has(key)) return exitsFound.get(key);
    const found = [], there = Math.hypot(to.x, to.y, to.z), aim = (Math.atan2(to.z, to.x) + 2 * Math.PI) % (2 * Math.PI), lean = 0.8 / Math.max(there - 1, 1);
    const inner = Math.max(there + 12.25, EXIT_FAILS_REGIONS), outer = there + 17.75;
    const test = (x, y, z) => {
      const radius = Math.hypot(x, y, z);
      if (radius <= EXIT_FAILS_REGIONS) return;
      const next = exitStream(g, x, y, z), v0 = next(), out = radius - (13.25 + 3.5 * v0);
      if (Math.abs(out - there) > 1) return;
      const bearing = next() * 2 * Math.PI, off = Math.abs(bearing - aim);
      if (Math.min(off, 2 * Math.PI - off) > lean) return;
      const ey = Math.round(4 - 8 * next());
      if (ey !== to.y) return;
      const flat = Math.sqrt(Math.max(out * out - ey * ey, 0)), ux = flat * Math.cos(bearing), uz = flat * Math.sin(bearing);
      if (Math.round(ux) !== to.x || Math.round(uz) !== to.z) return;
      found.push({ hole: { x, y, z, index: BLACK_HOLE_INDEX }, exit: { g, x: to.x, y: to.y, z: to.z, index: Math.floor(v0 * 120) + 1 }, radius, margin: 0.5 - Math.max(Math.abs(ux - to.x), Math.abs(uz - to.z)) });
    };
    if (Math.abs(to.y) <= EXIT_HEIGHT && outer > EXIT_FAILS_REGIONS) {
      for (let y = -MAX_Y; y <= MAX_Y; y++) {
        const outerFlat = outer * outer - y * y, innerFlat = inner * inner - y * y;
        if (outerFlat <= 0) continue;
        const xMost = Math.min(MAX_XZ, Math.floor(Math.sqrt(outerFlat)));
        for (let x = -xMost; x <= xMost; x++) {
          const zOuter = outerFlat - x * x, zInner = innerFlat - x * x;
          if (zOuter < 0) continue;
          const zHigh = Math.min(MAX_XZ, Math.floor(Math.sqrt(zOuter)));
          for (let z = zInner > 0 ? Math.ceil(Math.sqrt(zInner)) : 0; z <= zHigh; z++) {
            test(x, y, z);
            if (z) test(x, y, -z);
          }
        }
        if (onBatch && (await onBatch()) === false) return null;
      }
    }
    exitsFound.set(key, found);
    return found;
  }

  // the route the other settings ask for, between any two places
  async function planPlain(g, from, to, range, flown, opts, onDepth, wide = false) {
    if (opts.gpu && !opts.same && !(opts.only && Math.hypot(to.x, to.y, to.z) <= EXIT_FAILS_REGIONS)) {
      try { return await gpuSearchRoute(g, from, to, range, { ...opts, wide, gpu: opts.gpu === "auto" ? "fast" : opts.gpu }, flown, onDepth); }
      catch (e) {
        plan.gpuNote = `The graphics card couldn't be used: ${e.message}. Chrome or Edge with an up-to-date graphics driver can use it. This route is from the usual planner.`;
        opts.gpu = "";
      }
    }
    return opts.only || opts.same ? searchOnly(g, from, to, range, flown, onDepth, opts.same) : searchRoute(g, from, to, range, opts.guess || opts.force, flown, onDepth, opts.force, wide);
  }

  // Returns the route, null if it was given up on, or { why } if no black hole can do it. System Exit that can't be done falls back on landing in the region, one warp short, and says so
  async function searchEnding(g, from, to, range, flown, opts, onDepth, onStage) {
    const allowGuess = opts.guess || opts.force || opts.only || opts.same, there = Math.hypot(to.x, to.y, to.z), hex = to.index.toString(16).toUpperCase().padStart(3, "0");
    const calculated = await exitsInto(g, to, onStage && (() => onStage("looking")));
    if (!calculated) return null;
    const hit = e => e.x === to.x && e.y === to.y && e.z === to.z;
    const known = [...flown].filter(([, e]) => hit(e)).map(([where, e]) => {
      const [x, y, z] = where.split(",").map(Number);
      return { hole: { x, y, z, index: BLACK_HOLE_INDEX }, exit: { g, x: e.x, y: e.y, z: e.z, index: e.index }, radius: Math.hypot(x, y, z), margin: 1, kind: "flown" };
    });
    const every = [...known, ...calculated.filter(c => !flown.has(`${c.hole.x},${c.hole.y},${c.hole.z}`)).map(c => ({ ...c, kind: c.radius >= EXIT_TESTED_REGIONS ? "calculated" : "guess" }))];
    const usable = every.filter(c => c.kind !== "guess" || allowGuess), onStar = usable.filter(c => c.exit.index === to.index);
    let why = "";
    if (!usable.length) {
      if (Math.abs(to.y) > EXIT_HEIGHT) why = `Black holes always land within ${EXIT_HEIGHT} regions of the galaxy's plane, and this region is ${Math.abs(to.y)} away from it, so none can land here.`;
      else if (every.length) why = "Only best-guess black holes land in this region. Tick Use best-guess black holes to use them.";
      else if (there + 17.75 <= EXIT_FAILS_REGIONS) why = `The black holes that could land here are about ${num(Math.round((there + 15) * LY_PER_REGION))} ly from the core, too close for their exits to be calculated.`;
      else why = "None of the black holes the right distance from the core lands in this region.";
      return { why };
    }
    let missed = "";
    if (opts.system && !onStar.length) {
      missed = to.index > EXIT_LAST_STAR ? `Black holes only land on systems 001 to 078, and this is system ${hex}, so none can land on it.`
        : "No black hole leads into this system. Only about 1 system in 5 has one, as each black hole has just one exit.";
    }
    const pool = opts.system && onStar.length ? onStar : usable;
    const reach = range / LY_PER_REGION, startRadius = Math.hypot(from.x, from.y, from.z);
    const look = c => {       // a quick idea of the moves, to choose which get worked out in full
      const climb = Math.ceil(Math.max(0, Math.abs(c.hole.y) - EXIT_HEIGHT) / reach), inward = startRadius - c.radius;
      const viaJumps = (inward > 0 ? 2 * Math.ceil(inward / (16.75 + reach)) : 2 + Math.ceil((14 - inward) / reach)) + climb;
      return Math.min(warpsBetween(from, c.hole, range), viaJumps) + (c.exit.index === to.index ? 0 : 1);
    };
    const tested = c => Math.abs(c.hole.y) <= EXIT_RECORDED_HEIGHT, sure = c => c.margin >= ENDING_SURE && tested(c);
    const weigh = (moves, c) => moves + (sure(c) ? 0 : ENDING_SURE_WORTH) + (tested(c) ? 0 : ENDING_SURE_WORTH);
    const chosen = [...pool].sort((a, b) => weigh(look(a), a) - weigh(look(b), b) || b.margin - a.margin).slice(0, ENDING_PLANS);
    let best = null, bestWeight = Infinity;
    for (let i = 0; i < chosen.length; i++) {
      const c = chosen[i];
      if (best && weigh(look(c), c) > bestWeight) continue;
      if (onStage && (await onStage("planning", i + 1, chosen.length)) === false) return null;
      let way = await planPlain(g, from, c.hole, range, flown, opts, onDepth);
      if (!way) return null;
      if (allowGuess && !opts.only && !opts.same && i < ENDING_CHAINS) {
        const chain = await searchOnly(g, from, c.hole, range, flown, onDepth);
        if (!chain) return null;
        if (chain.total < way.total) way = chain;
      }
      const moves = way.total + 1 + (c.exit.index === to.index ? 0 : 1), weight = weigh(moves, c);
      if (weight < bestWeight || (weight === bestWeight && c.margin > best.c.margin)) { best = { c, way }; bestWeight = weight; }
    }
    const { c, way } = best, onTarget = c.exit.index === to.index, jump = { type: "jump", from: c.hole, to: c.exit, kind: c.kind, ending: onTarget ? "Lands on your destination" : "Lands in your destination's region" };
    const last = onTarget ? null : legOf(c.exit, to, range), steps = last ? [...way.steps, jump, last] : [...way.steps, jump], warps = way.warps + (last ? last.warps : 0), jumps = way.jumps + 1;
    return { g, from, to, range, direct: sameStar(from, to) ? 0 : legOf(from, to, range).warps, total: warps + jumps, warps, jumps, steps, forced: !!opts.force, widened: false, only: !!(opts.only || opts.same), same: !!opts.same, tail: way.tail || 0, gpu: way.gpu,
      ending: { got: onTarget ? "system" : "region", missed, kind: c.kind, sure: sure(c), central: c.margin >= ENDING_SURE, height: c.hole.y, count: pool.length } };
  }

