// Exact source excerpts from nms/voyage/voyage.js, frozen 2026-11-04.
// Reference fragments: omitted base generator and UI helpers remain external.

// Original lines 2336-2392
  // the system numbers a kind can be at in a region, the ones sure to exist first. Close to the core some of the guide stars are coloured, which the generator works out from the distance
  function* findNumbers(kind, x, y, z) {
    if (kind.id === "hole") { yield BLACK_HOLE_INDEX; return; }
    if (kind.id === "atlas") { yield ATLAS_INDEX; return; }
    if (kind.band === "purple") { for (let i = FIND_PURPLE[0]; i <= FIND_PURPLE[1]; i++) yield i; return; }
    const radius = Math.trunc(Math.hypot(x, y, z));
    const coloured = radius > CORE_GAP && radius < 1440 ? BLACK_HOLE_INDEX - 1 - Math.min(BLACK_HOLE_INDEX - 1, Math.max(0, Math.trunc((radius - CORE_GAP) * (BLACK_HOLE_INDEX - 1) / 1440))) : 0;
    for (let i = 1; i <= coloured; i++) yield i;
    yield BLACK_HOLE_INDEX;
    yield ATLAS_INDEX;
    for (let i = FIND_LOW[0]; i <= FIND_LOW[1]; i++) yield i;
  }
  function regionMatches(g, x, y, z, kind) {
    const key = `${kind.id}:${g}:${x}:${y}:${z}`;
    if (!findCache.has(key)) {
      const a = api(), hits = [];
      for (const index of findNumbers(kind, x, y, z)) {
        if (!kind.test(a.describeSystem(new a.UA({ x, y, z, galaxy: g, system: index })))) continue;
        hits.push(index);
        if (hits.length === FIND_PER_REGION) break;
      }
      if (findCache.size > 20000) findCache.clear();
      findCache.set(key, hits);
    }
    return findCache.get(key);
  }
  // the nearest of each kind, sharing the list evenly. One star can count for two kinds
  function findRows(place, kinds) {
    const regions = holesAround(place, FIND_REACH), each = Math.ceil(FIND_ROWS / kinds.length), rows = new Map();
    for (const kind of kinds) {
      let found = 0;
      for (const region of regions) {
        for (const index of regionMatches(place.g, region.x, region.y, region.z, kind)) {
          const key = `${region.x},${region.y},${region.z},${index}`;
          if (!rows.has(key)) rows.set(key, { g: place.g, x: region.x, y: region.y, z: region.z, index, kinds: [] });
          rows.get(key).kinds.push(kind.id);
          found++;
        }
        if (found >= each) break;
      }
    }
    return [...rows.values()].sort((a, b) => lightYears(a, place) - lightYears(b, place) || a.index - b.index);
  }
  // where to look: the chosen place, or wherever the search box names. Anything else in the box narrows the list by name
  function findList(base, kinds) {
    const q = holeQuery.trim(), a = api();
    let place = base, needle = "";
    if (q) {
      const code = parseCode(q), region = /^[0-9a-f]{8}$/i.test(q) ? q.toUpperCase() : null, numbers = q.match(/^(-?\d+)[\s,]+(-?\d+)[\s,]+(-?\d+)$/);
      const at = code ? starAt(base.g, code) : region ? new a.UA(region) : numbers ? { x: clampTo(+numbers[1], MAX_XZ), y: clampTo(+numbers[2], MAX_Y), z: clampTo(+numbers[3], MAX_XZ) } : null;
      if (at) place = { ...base, x: at.x, y: at.y, z: at.z };
      else needle = q.toLowerCase();
    }
    let rows = findRows(place, kinds);
    if (needle) rows = rows.filter(row => placeName(row.g, row).toLowerCase().includes(needle) || a.db().generateRegionName(row.g, new a.UA({ x: row.x, y: row.y, z: row.z }).regionHex).toLowerCase().includes(needle));
    return { rows, place, note: needle ? "Names are only searched among the systems listed here. Coordinates, a region or an address will look anywhere." : "" };
  }

// Original lines 2456-2468
  function holesAround(base, reach) {
    const rows = [], high = Math.min(reach, 4);
    for (let dy = -high; dy <= high; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dz = -reach; dz <= reach; dz++) {
          const x = base.x + dx, y = base.y + dy, z = base.z + dz;
          if (dx * dx + dy * dy + dz * dz > reach * reach || Math.abs(x) > MAX_XZ || Math.abs(y) > MAX_Y || Math.abs(z) > MAX_XZ || Math.trunc(Math.hypot(x, y, z)) < CORE_GAP) continue;
          rows.push({ g: base.g, x, y, z, index: BLACK_HOLE_INDEX });
        }
      }
    }
    return rows.sort((a, b) => lightYears(a, base) - lightYears(b, base));
  }

