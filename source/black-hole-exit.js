// Exact source excerpts from nms/voyage/voyage.js, frozen 2026-11-04.
// Reference fragments: omitted base generator and UI helpers remain external.

// Original lines 1172-1195
  // ---- where a black hole leads ----
  // Worked out from the jumps in the saves. The exit comes from a stream seeded by the black hole's own address, with the same generator the map uses for
  // everything else, so it's the same for every player. The first number sets the exit's system and part of how far in it goes, the second its bearing around
  // the core, the third its height. Only the distance's 13.25 and 3.5 are fitted, and they leave the exit one region out about 3 times in 10.
  // Near the galaxy's corners the landing point can fall beyond its edge; the game then takes the nearest region inside, which can be hundreds of thousands
  // of light-years from the hole. The wiki calls those hyper black holes: its four recorded corner jumps match this rule, three exactly and one a region off.
  function exitStream(g, x, y, z, index = BLACK_HOLE_INDEX) {
    // the generator's 64-bit state as two 32-bit halves, and its multiplier 1517746329 in 16-bit parts, so route searches can afford thousands of these and every sum stays exact
    const t = (y & 0xff) * 16777216 + (z & 0xfff) * 4096 + (x & 0xfff);
    let lo = t || 1, hi = (((index << 8) | g) ^ t ^ ((t * 65536) % 4294967296 + Math.floor(t / 65536))) >>> 0;
    return () => {
      const low16 = lo & 0xffff, high16 = lo >>> 16, middle = high16 * 0xf899 + low16 * 0x5a76;
      const sum = low16 * 0xf899 + (middle % 65536) * 65536 + hi, carry = Math.floor(sum / 4294967296);
      hi = (high16 * 0x5a76 + Math.floor(middle / 65536) + carry) % 4294967296;
      lo = sum - carry * 4294967296;
      return lo / 4294967296;
    };
  }
  function blackHoleExit(g, x, y, z, index = BLACK_HOLE_INDEX) {
    const next = exitStream(g, x, y, z, index), v0 = next(), bearing = next() * 2 * Math.PI, ey = Math.round(4 - 8 * next());
    const out = Math.hypot(x, y, z) - (13.25 + 3.5 * v0), flat = Math.sqrt(Math.max(out * out - ey * ey, 0));
    const rx = Math.round(flat * Math.cos(bearing)), rz = Math.round(flat * Math.sin(bearing)), ex = Math.max(-MAX_XZ, Math.min(MAX_XZ, rx)), ez = Math.max(-MAX_XZ, Math.min(MAX_XZ, rz));
    return { g, x: ex, y: ey, z: ez, index: Math.floor(v0 * 120) + 1, hyper: ex !== rx || ez !== rz };
  }

