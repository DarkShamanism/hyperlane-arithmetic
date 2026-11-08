// Exact source excerpts from nms/voyage/voyage.js, frozen 2026-11-04.
// Reference fragments: omitted base generator and UI helpers remain external.

// Original lines 3125-3549
  const ROUTE_KERNEL = `
struct Params { nStates: u32, nOffsets: u32, galaxy: u32, rowWidth: u32,
  toX: i32, toY: i32, toZ: i32, toIndex: i32,
  rangeLy: f32, rd: f32, failsRadius: f32, testedRadius: f32,
  threshF: u32, threshTb: u32, tieQuota: u32, mask: u32,
  maxOut: u32, flownMask: u32, allowGuess: u32, coreGap: f32,
  flownAt: u32, slots: u32, base: u32, pad1: u32 }
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> states: array<vec4<i32>>;        // a landing: x, y, z, warps so far | jumps so far << 16
@group(0) @binding(2) var<storage, read> tables: array<i32>;              // the offsets to try as x, y, z triples, then the flown black holes: key, exit key, exit system
@group(0) @binding(3) var<storage, read_write> work: array<atomic<u32>>;  // counts by score, counts by tiebreak, counters, the table of landings (keys, scores, who), then the winners
var<workgroup> local: array<atomic<u32>, 4096>;
const HIST_F = 0u; const HIST_TB = 4096u; const TIES = 4352u; const OUT_COUNT = 4353u; const DROPPED = 4354u; const TABLE = 4356u;
const MULT: u32 = 1517746329u;
struct Cand { ok: bool, key: u32, f: u32, tb: u32 }
fn mul64(a: u32, b: u32) -> vec2<u32> {
  let a0 = a & 0xFFFFu; let a1 = a >> 16u; let b0 = b & 0xFFFFu; let b1 = b >> 16u;
  let p00 = a0 * b0; let p01 = a0 * b1; let p10 = a1 * b0; let p11 = a1 * b1;
  let mid = (p00 >> 16u) + (p01 & 0xFFFFu) + (p10 & 0xFFFFu);
  return vec2<u32>((p00 & 0xFFFFu) | (mid << 16u), p11 + (p01 >> 16u) + (p10 >> 16u) + (mid >> 16u));
}
fn step(s: vec2<u32>) -> vec2<u32> {
  let m = mul64(s.x, MULT); let lo = m.x + s.y;
  return vec2<u32>(lo, m.y + select(0u, 1u, lo < m.x));
}
fn packKey(p: vec3<i32>) -> u32 { return (u32(p.x + 2048) << 20u) | (u32(p.y + 128) << 12u) | u32(p.z + 2048); }
fn unpackKey(k: u32) -> vec3<i32> { return vec3<i32>(i32(k >> 20u) - 2048, i32((k >> 12u) & 0xFFu) - 128, i32(k & 0xFFFu) - 2048); }
fn hashKey(k: u32) -> u32 { var x = k * 2654435761u; x = x ^ (x >> 15u); x = x * 2246822519u; return x ^ (x >> 13u); }
fn warps(a: vec3<i32>, b: vec3<i32>) -> u32 {
  let d = a - b; let d2 = d.x * d.x + d.y * d.y + d.z * d.z;
  return max(1u, u32(ceil(sqrt(f32(d2)) * 400.0 / P.rangeLy)));
}
// sin and cos of u / 2^32 turns: the quarter turn and the fraction of it are exact, so only the last multiplication rounds
fn sincos(u: u32) -> vec2<f32> {
  let quarters = f32(u >> 8u) / 4194304.0;
  let k = floor(quarters + 0.5);
  let part = quarters - k;
  let r = part * 1.5707963705062866 + part * -4.371139e-8 + f32(u & 0xFFu) * 1.4629180792671596e-9;
  let r2 = r * r;
  let s = r * (1.0 + r2 * (-1.0 / 6.0 + r2 * (1.0 / 120.0 + r2 * (-1.0 / 5040.0 + r2 * (1.0 / 362880.0)))));
  let c = 1.0 + r2 * (-0.5 + r2 * (1.0 / 24.0 + r2 * (-1.0 / 720.0 + r2 * (1.0 / 40320.0 + r2 * (-1.0 / 3628800.0)))));
  let q = u32(k) & 3u;
  if (q == 1u) { return vec2<f32>(c, -s); }
  if (q == 2u) { return vec2<f32>(-s, -c); }
  if (q == 3u) { return vec2<f32>(-c, s); }
  return vec2<f32>(s, c);
}
// where a black hole leads, as blackHoleExit has it: x, y, z and system, with system 0 when it lands outside the galaxy
fn exitOf(h: vec3<i32>) -> vec4<i32> {
  let t = ((bitcast<u32>(h.y) & 0xFFu) << 24u) | ((bitcast<u32>(h.z) & 0xFFFu) << 12u) | (bitcast<u32>(h.x) & 0xFFFu);
  let lo = select(t, 1u, t == 0u);
  let hi = (0x7900u | P.galaxy) ^ t ^ ((t << 16u) | (t >> 16u));
  let s1 = step(vec2<u32>(lo, hi)); let s2 = step(s1); let s3 = step(s2);
  let v0 = f32(s1.x) / 4294967296.0;
  let v2 = f32(s3.x) / 4294967296.0;
  let ey = i32(floor(4.5 - 8.0 * v2));
  let hr = sqrt(f32(h.x * h.x + h.y * h.y + h.z * h.z));
  let out = hr - (13.25 + 3.5 * v0);
  let flat = sqrt(max(out * out - f32(ey * ey), 0.0));
  let sc = sincos(s2.x);
  let ex = clamp(i32(floor(flat * sc.y + 0.5)), -2047, 2047); let ez = clamp(i32(floor(flat * sc.x + 0.5)), -2047, 2047);     // beyond the edge: the nearest region inside
  return vec4<i32>(ex, ey, ez, i32(floor(v0 * 120.0)) + 1);
}
// one landing and one black hole near it: where the jump lands and how that landing scores: the moves so far plus the fewer of the warps straight to the
// destination and two moves per jump still needed plus one, both as fractions so that a landing a little deeper or a little closer ranks a little better.
// The score is kept to 1/256 of a move, as a whole part f and a fraction tb
fn evaluate(flat: u32) -> Cand {
  var c: Cand; c.ok = false;
  let si = flat / P.nOffsets; let oi = flat - si * P.nOffsets;
  let s = states[si];
  let h = s.xyz + vec3<i32>(tables[oi * 3u], tables[oi * 3u + 1u], tables[oi * 3u + 2u]);
  if (abs(h.x) > 2047 || abs(h.y) > 127 || abs(h.z) > 2047) { return c; }
  let hr = sqrt(f32(h.x * h.x + h.y * h.y + h.z * h.z));
  if (hr < P.coreGap) { return c; }
  var e = vec4<i32>(0, 0, 0, 0);
  var known = false;
  if (P.flownMask != 0u) {
    let hk = packKey(h);
    var i = hashKey(hk) & P.flownMask;
    for (var p = 0u; p < 16u; p++) {
      let k = bitcast<u32>(tables[P.flownAt + i * 3u]);
      if (k == 0u) { break; }
      if (k == hk) { e = vec4<i32>(unpackKey(bitcast<u32>(tables[P.flownAt + i * 3u + 1u])), tables[P.flownAt + i * 3u + 2u]); known = true; break; }
      i = (i + 1u) & P.flownMask;
    }
  }
  if (!known) {
    if (hr <= P.failsRadius || (hr < P.testedRadius && P.allowGuess == 0u)) { return c; }
    e = exitOf(h);
    if (e.w == 0) { return c; }
  }
  let to = vec3<i32>(P.toX, P.toY, P.toZ);
  let g = (bitcast<u32>(s.w) & 0xFFFFu) + warps(s.xyz, h);
  let j = (bitcast<u32>(s.w) >> 16u) + 1u;
  let d = e.xyz - to;
  var straight = sqrt(f32(d.x * d.x + d.y * d.y + d.z * d.z)) * 400.0 / P.rangeLy;
  if (all(e.xyz == to) && e.w == P.toIndex) { straight = 0.0; }
  let r = sqrt(f32(e.x * e.x + e.y * e.y + e.z * e.z));
  let gain = r - P.rd;
  var left = straight;
  if (gain > 7.0) { left = min(straight, 2.0 * gain / 15.0 + 1.0); }
  let rank = u32(clamp((f32(g + j) + left) * 256.0, 0.0, 1048575.0));
  c.ok = true; c.key = packKey(e.xyz); c.f = rank >> 8u; c.tb = rank & 255u;
  return c;
}
fn flatOf(id: vec3<u32>) -> u32 { return P.base + id.x + id.y * P.rowWidth; }
fn wanted(c: Cand) -> bool { return c.ok && (c.f < P.threshF || (c.f == P.threshF && c.tb <= P.threshTb)); }
@compute @workgroup_size(256)
fn histF(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  for (var w = li; w < 4096u; w += 256u) { atomicStore(&local[w], 0u); }
  workgroupBarrier();
  let flat = flatOf(id);
  if (flat < P.nStates * P.nOffsets) { let c = evaluate(flat); if (c.ok) { atomicAdd(&local[c.f], 1u); } }
  workgroupBarrier();
  for (var w = li; w < 4096u; w += 256u) { let n = atomicLoad(&local[w]); if (n != 0u) { atomicAdd(&work[HIST_F + w], n); } }
}
@compute @workgroup_size(256)
fn histTb(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (li < 256u) { atomicStore(&local[li], 0u); }
  workgroupBarrier();
  let flat = flatOf(id);
  if (flat < P.nStates * P.nOffsets) { let c = evaluate(flat); if (c.ok && c.f == P.threshF) { atomicAdd(&local[c.tb], 1u); } }
  workgroupBarrier();
  if (li < 256u) { let n = atomicLoad(&local[li]); if (n != 0u) { atomicAdd(&work[HIST_TB + li], n); } }
}
// landings that make the cut go into the table, one slot per exit region, keeping the best score seen for it
@compute @workgroup_size(256)
fn insert(@builtin(global_invocation_id) id: vec3<u32>) {
  let flat = flatOf(id);
  if (flat >= P.nStates * P.nOffsets) { return; }
  let c = evaluate(flat);
  if (!wanted(c)) { return; }
  if (c.f == P.threshF && c.tb == P.threshTb) { if (atomicAdd(&work[TIES], 1u) >= P.tieQuota) { return; } }
  var i = hashKey(c.key) & P.mask;
  var slot = 0xFFFFFFFFu;
  for (var p = 0u; p < 64u; p++) {
    let k = atomicLoad(&work[TABLE + i]);
    if (k == c.key) { slot = i; break; }
    if (k == 0u) {
      let r = atomicCompareExchangeWeak(&work[TABLE + i], 0u, c.key);
      if (r.exchanged || r.old_value == c.key) { slot = i; break; }
      if (r.old_value == 0u) { continue; }
    }
    i = (i + 1u) & P.mask;
  }
  if (slot == 0xFFFFFFFFu) { atomicAdd(&work[DROPPED], 1u); return; }
  let inv = 0xFFFFFFFFu - (c.f * 256u + c.tb);
  if (atomicLoad(&work[TABLE + P.slots + slot]) < inv) { atomicMax(&work[TABLE + P.slots + slot], inv); }
}
// the landing that set a slot's best score claims it, lowest numbered first, so the slot can say which black hole it came from
@compute @workgroup_size(256)
fn claim(@builtin(global_invocation_id) id: vec3<u32>) {
  let flat = flatOf(id);
  if (flat >= P.nStates * P.nOffsets) { return; }
  let c = evaluate(flat);
  if (!wanted(c)) { return; }
  var i = hashKey(c.key) & P.mask;
  for (var p = 0u; p < 64u; p++) {
    let k = atomicLoad(&work[TABLE + i]);
    if (k == 0u) { return; }
    if (k == c.key) { break; }
    i = (i + 1u) & P.mask;
    if (p == 63u) { return; }
  }
  if (atomicLoad(&work[TABLE + P.slots + i]) == 0xFFFFFFFFu - (c.f * 256u + c.tb)) { atomicMax(&work[TABLE + 2u * P.slots + i], 0xFFFFFFFFu - flat); }
}
@compute @workgroup_size(256)
fn compact(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = flatOf(id);
  if (i >= P.slots) { return; }
  let key = atomicLoad(&work[TABLE + i]);
  if (key == 0u) { return; }
  let who = atomicLoad(&work[TABLE + 2u * P.slots + i]);
  if (who == 0u) { return; }
  let n = atomicAdd(&work[OUT_COUNT], 1u);
  if (n >= P.maxOut) { return; }
  let at = TABLE + 3u * P.slots + n * 3u;
  atomicStore(&work[at], key);
  atomicStore(&work[at + 1u], 0xFFFFFFFFu - atomicLoad(&work[TABLE + P.slots + i]));
  atomicStore(&work[at + 2u], 0xFFFFFFFFu - who);
}`;
  let gpuRouteReady = null;
  function gpuRoutePipelines() {
    gpuRouteReady ||= (async () => {
      const { device, name } = await gpuDevice();
      device.lost.then(() => { gpuRouteReady = null; });
      const module = device.createShaderModule({ code: ROUTE_KERNEL });
      const info = await module.getCompilationInfo();
      const bad = info.messages.filter(m => m.type === "error");
      if (bad.length) throw new Error(`the route shader didn't compile: ${bad[0].message}`);
      const entry = (binding, type) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } });
      const layout = device.createBindGroupLayout({ entries: [entry(0, "uniform"), entry(1, "read-only-storage"), entry(2, "read-only-storage"), entry(3, "storage")] });
      const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] }), pipelines = {};
      await Promise.all(["histF", "histTb", "insert", "claim", "compact"].map(async entryPoint => { pipelines[entryPoint] = await device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module, entryPoint } }); }));
      return { device, layout, pipelines, name };
    })().catch(e => { gpuRouteReady = null; throw e; });
    return gpuRouteReady;
  }
  const routeKey = (x, y, z) => (((x + 2048) << 20) | ((y + 128) << 12) | (z + 2048)) >>> 0;
  const routeHash = k => { let x = Math.imul(k, 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; return (x ^ (x >>> 13)) >>> 0; };
  // Same arguments as searchRoute and searchOnly and the same route back, with gpu: { level, chains, checked, depth, seconds } added. opts.gpu names the level;
  // opts.only, opts.force and opts.wide pick the search: a chain of one warp and one jump each, black holes whatever they cost, or black holes up to 32 regions away
  async function gpuSearchRoute(g, from, to, range, opts, flown, onDepth) {
    const { device, layout, pipelines } = await gpuRoutePipelines();
    const level = ROUTE_GPU_LEVELS[opts.gpu] || ROUTE_GPU_LEVELS.fast, began = performance.now();
    const mode = opts.only ? "only" : opts.wide ? "wide" : opts.force ? "force" : "plain", perWarp = range / LY_PER_REGION;
    const usual = mode === "wide" ? ROUTE_WIDE_REACH : mode === "plain" ? Math.min(8, Math.max(3, Math.ceil(perWarp))) : Math.max(0, Math.min(8, Math.floor(perWarp)));
    const reach = mode === "plain" ? Math.min(level.reach || ROUTE_GPU_REACH, Math.max(usual, Math.ceil(level.warps * perWarp))) : usual, high = Math.min(reach, 4);
    const offsets = [];
    for (let dy = -high; dy <= high; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dz = -reach; dz <= reach; dz++) {
          if (mode === "only" ? Math.hypot(dx, dy, dz) * LY_PER_REGION > range : dx * dx + dy * dy + dz * dz > reach * reach) continue;
          offsets.push(dx, dy, dz);
        }
      }
    }
    const nOffsets = offsets.length / 3, slotsPer = level.all ? 16 : 8, outPer = level.all ? 6 : 3;
    const sizes = k => { let n = 1024; while (n < slotsPer * k) n *= 2; return { slots: n, maxOut: outPer * k, workWords: ROUTE_GPU_TABLE + 3 * n + 3 * outPer * k }; };
    const roomFor = Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize) / 4;
    let K = Math.max(ROUTE_GPU_LEAST, Math.min(level.most || ROUTE_GPU_MOST, Math.floor(level.budget / nOffsets)));
    while (K > ROUTE_GPU_LEAST && sizes(K).workWords > roomFor) K = Math.floor(K / 2);
    // exits really flown, in a small table the card probes the same way this side filled it
    const flownList = [...flown].map(([where, e]) => { const [x, y, z] = where.split(",").map(Number); return { key: routeKey(x, y, z), exit: routeKey(e.x, e.y, e.z), index: e.index || 1 }; });
    let flownSlots = 0;
    if (flownList.length) { flownSlots = 64; while (flownSlots < flownList.length * 4) flownSlots *= 2; }
    const flownMask = flownSlots ? flownSlots - 1 : 0, flownAt = nOffsets * 3, tables = new Int32Array(flownAt + flownSlots * 3);
    tables.set(offsets);
    for (const f of flownList) {
      let i = routeHash(f.key) & flownMask;
      while (tables[flownAt + i * 3] !== 0) i = (i + 1) & flownMask;
      tables[flownAt + i * 3] = f.key | 0;
      tables[flownAt + i * 3 + 1] = f.exit | 0;
      tables[flownAt + i * 3 + 2] = f.index;
    }
    const { slots, maxOut, workWords } = sizes(K), mask = slots - 1;
    const U = GPUBufferUsage, params = device.createBuffer({ size: 96, usage: U.UNIFORM | U.COPY_DST });
    const statesBuf = device.createBuffer({ size: K * 16, usage: U.STORAGE | U.COPY_DST });
    const tablesBuf = device.createBuffer({ size: Math.max(16, tables.byteLength), usage: U.STORAGE | U.COPY_DST });
    const work = device.createBuffer({ size: workWords * 4, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    const histBack = device.createBuffer({ size: ROUTE_GPU_COUNTERS * 4, usage: U.MAP_READ | U.COPY_DST });
    const outBack = device.createBuffer({ size: (4 + 3 * maxOut) * 4, usage: U.MAP_READ | U.COPY_DST });
    const buffers = [params, statesBuf, tablesBuf, work, histBack, outBack];
    try {
      device.queue.writeBuffer(tablesBuf, 0, tables);
      const bind = device.createBindGroup({ layout, entries: [params, statesBuf, tablesBuf, work].map((buffer, binding) => ({ binding, resource: { buffer } })) });
      const there = Math.hypot(to.x, to.y, to.z), allowGuess = mode === "plain" ? opts.guess || opts.force : true;
      const p = new ArrayBuffer(96), pu = new Uint32Array(p), pi = new Int32Array(p), pf = new Float32Array(p);
      pu.set([0, nOffsets, g, ROUTE_GPU_ROW]);
      pi.set([to.x, to.y, to.z, to.index], 4);
      pf.set([range, there, EXIT_FAILS_REGIONS, EXIT_TESTED_REGIONS], 8);
      pu.set([0, 0, 0, mask, maxOut, flownMask, allowGuess ? 1 : 0], 12);
      pf[19] = CORE_GAP;
      pu.set([flownAt, slots], 20);
      const setParams = (nStates, threshF, threshTb, tieQuota, base = 0) => { pu[0] = nStates; pu[12] = threshF; pu[13] = threshTb; pu[14] = tieQuota; pu[22] = base; device.queue.writeBuffer(params, 0, p); };
      const lost = device.lost.then(info => { throw new Error(`the graphics card stopped responding${info && info.message ? ` (${info.message})` : ""}`); });
      const waitFor = promise => Promise.race([promise, lost]);
      const perMs = { histF: 1 << 18, histTb: 1 << 18, insert: 1 << 16, claim: 1 << 16, compact: 1 << 18 };     // candidates a millisecond, learnt as the card runs; the first pieces are small
      // a kernel over all the candidates, in pieces of about a quarter of a second each, since Windows resets a card that runs one piece for two seconds
      const dispatch = async (name, total) => {
        for (let base = 0; base < total;) {
          const piece = Math.min(total - base, Math.max(1 << 22, Math.min(1 << 30, Math.floor(perMs[name] * 250 / ROUTE_GPU_ROW) * ROUTE_GPU_ROW || 1 << 22)));
          pu[22] = base; device.queue.writeBuffer(params, 0, p);
          const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
          pass.setPipeline(pipelines[name]);
          pass.setBindGroup(0, bind);
          pass.dispatchWorkgroups(Math.min(16384, Math.ceil(piece / 256)), Math.ceil(piece / ROUTE_GPU_ROW));
          pass.end();
          const t0 = performance.now();
          device.queue.submit([encoder.finish()]);
          await waitFor(device.queue.onSubmittedWorkDone());
          const ms = performance.now() - t0;
          if (ms > 2) perMs[name] = Math.max(1 << 14, Math.round(piece / ms));
          base += piece;
        }
      };
      // clears, then the kernels one after another, then parts of work copied back and returned as words
      const run = async (clears, jobs, copies, back) => {
        const encoder = device.createCommandEncoder();
        for (const [fromByte, size] of clears) { if (size === undefined) encoder.clearBuffer(work); else encoder.clearBuffer(work, fromByte, size); }
        device.queue.submit([encoder.finish()]);
        for (const [name, total] of jobs) await dispatch(name, total);
        const copier = device.createCommandEncoder();
        let bytes = 0;
        for (const [fromByte, size] of copies) { copier.copyBufferToBuffer(work, fromByte, back, bytes, size); bytes += size; }
        device.queue.submit([copier.finish()]);
        await waitFor(back.mapAsync(GPUMapMode.READ, 0, bytes));
        const words = new Uint32Array(back.getMappedRange(0, bytes).slice(0));
        back.unmap();
        return words;
      };
      const warpsOf = (ax, ay, az, bx, by, bz) => Math.max(1, Math.ceil(Math.hypot(ax - bx, ay - by, az - bz) * LY_PER_REGION / range));
      const layer = n => ({ n: 0, x: new Int16Array(n), y: new Int16Array(n), z: new Int16Array(n), warps: new Uint16Array(n), jumps: new Uint16Array(n), parent: new Uint32Array(n), offset: new Uint16Array(n) });
      const first = layer(1);
      first.n = 1; first.x[0] = from.x; first.y[0] = from.y; first.z[0] = from.z;
      const layers = [first], stateData = new Int32Array(K * 4), rankCounts = new Uint32Array(ROUTE_GPU_F * ROUTE_GPU_TB);
      const away = (x, y, z) => Math.hypot(x - to.x, y - to.y, z - to.z), startAway = away(from.x, from.y, from.z), closer = mode === "force" || mode === "wide";
      const straightOf = (hx, hy, hz, ex, ey, ez) => {
        if (ex !== to.x || ey !== to.y || ez !== to.z) return warpsOf(ex, ey, ez, to.x, to.y, to.z);
        const exit = flown.get(`${hx},${hy},${hz}`) || blackHoleExit(g, hx, hy, hz);     // a landing in the destination's region: 0 only if it's the very star
        return exit && exit.index === to.index ? 0 : 1;
      };
      const maxDepth = Math.min(ROUTE_MAX_JUMPS, Math.ceil(Math.max(0, Math.hypot(from.x, from.y, from.z) - Math.max(there - 8, CORE_GAP)) / 13) + 12);
      let cur = first, rho = 1, checked = 0, best = null, bestCost = mode === "plain" ? warpsBetween(from, to, range) : Infinity, stalled = 0, cuts = 0, peak = 0;
      const timing = { counts: 0, cut: 0, pick: 0, here: 0 }, clock = () => performance.now();
      for (let depth = 1; depth <= maxDepth && cur.n && stalled < ROUTE_GPU_STALL; depth++) {
        for (let i = 0; i < cur.n; i++) { stateData[i * 4] = cur.x[i]; stateData[i * 4 + 1] = cur.y[i]; stateData[i * 4 + 2] = cur.z[i]; stateData[i * 4 + 3] = cur.warps[i] | (cur.jumps[i] << 16); }
        device.queue.writeBuffer(statesBuf, 0, stateData, 0, cur.n * 4);
        const total = cur.n * nOffsets;
        checked += total;
        let t = clock(), entries = null, count = 0, threshRank = 0, whole = false;
        if (level.all) {      // first with no cut at all: when every distinct landing fits the table, this jump is complete
          setParams(cur.n, ROUTE_GPU_F - 1, ROUTE_GPU_TB - 1, 0xFFFFFFFF);
          const back = await run([[ROUTE_GPU_COUNTERS * 4, (4 + 3 * slots + 3 * maxOut) * 4]], [["insert", total], ["claim", total], ["compact", slots]],
            [[ROUTE_GPU_COUNTERS * 4, 16], [(ROUTE_GPU_TABLE + 3 * slots) * 4, 3 * maxOut * 4]], outBack);
          timing.pick += clock() - t;
          if (back[1] <= maxOut && back[2] === 0) { whole = true; count = back[1]; entries = back.subarray(4, 4 + 3 * count); threshRank = ROUTE_GPU_F * ROUTE_GPU_TB - 1; }
        }
        let valid = 0, histF = null;
        if (!whole) {
          t = clock();
          setParams(cur.n, 0, 0, 0);
          histF = await run([[0]], [["histF", total]], [[0, ROUTE_GPU_F * 4]], histBack);
          timing.counts += clock() - t;
          for (let f = 0; f < ROUTE_GPU_F; f++) valid += histF[f];
        }
        for (let attempt = 0; attempt < 2 && !whole; attempt++) {
          // the cut: the score and tiebreak where the K-th best landing falls, allowing rho candidates per distinct exit, as neighbouring landings share most black holes
          const target = Math.min(valid, Math.max(1, Math.ceil(K * rho)));
          let cum = 0, threshF = ROUTE_GPU_F - 1, belowF = valid;
          for (let f = 0; f < ROUTE_GPU_F; f++) { if (cum + histF[f] >= target) { threshF = f; belowF = cum; break; } cum += histF[f]; }
          setParams(cur.n, threshF, 0, 0);
          t = clock();
          const histTb = await run([[ROUTE_GPU_F * 4, ROUTE_GPU_TB * 4]], [["histTb", total]], [[ROUTE_GPU_F * 4, ROUTE_GPU_TB * 4]], histBack);
          timing.cut += clock() - t;
          let cumTb = 0, threshTb = ROUTE_GPU_TB - 1, belowTb = 0;
          for (let t = 0; t < ROUTE_GPU_TB; t++) { if (belowF + cumTb + histTb[t] >= target) { threshTb = t; belowTb = cumTb; break; } cumTb += histTb[t]; belowTb = cumTb; }
          const tieQuota = Math.max(1, target - belowF - belowTb);
          setParams(cur.n, threshF, threshTb, tieQuota);
          t = clock();
          const back = await run([[ROUTE_GPU_COUNTERS * 4, (4 + 3 * slots + 3 * maxOut) * 4]], [["insert", total], ["claim", total], ["compact", slots]],
            [[ROUTE_GPU_COUNTERS * 4, 16], [(ROUTE_GPU_TABLE + 3 * slots) * 4, 3 * maxOut * 4]], outBack);
          timing.pick += clock() - t;
          count = Math.min(back[1], maxOut);
          entries = back.subarray(4, 4 + 3 * count);
          threshRank = threshF * ROUTE_GPU_TB + threshTb;
          let uniqueBelow = 0;
          for (let i = 0; i < count; i++) if (entries[i * 3 + 1] < threshRank) uniqueBelow++;
          rho = Math.min(64, Math.max(1, (belowF + belowTb) / Math.max(1, uniqueBelow)));
          if (count >= K / 2 || valid <= target) break;
          rho = Math.min(64, rho * Math.min(8, K / Math.max(1, count)));      // far fewer distinct exits than counted: allow more per exit and cut again
        }
        // the best K by score, from the counts of each score among what came back
        t = clock();
        if (!whole || count > K) cuts++;
        peak = Math.max(peak, count);
        let take = count, cutRank = -1, cutLeft = 0;
        if (count > K) {
          for (let i = 0; i < count; i++) rankCounts[entries[i * 3 + 1]]++;
          let seen = 0;
          for (let r = 0; r <= threshRank; r++) { if (seen + rankCounts[r] > K) { cutRank = r; cutLeft = K - seen; break; } seen += rankCounts[r]; }
          for (let i = 0; i < count; i++) rankCounts[entries[i * 3 + 1]] = 0;
          take = K;
        }
        const next = layer(Math.min(K, count));
        let improved = false;
        for (let i = 0; i < count && next.n < take; i++) {
          const key = entries[i * 3], rank = entries[i * 3 + 1], flat = entries[i * 3 + 2];
          if (cutRank >= 0 && (rank > cutRank || (rank === cutRank && cutLeft-- <= 0))) continue;
          const si = Math.floor(flat / nOffsets), oi = flat - si * nOffsets;
          const px = cur.x[si], py = cur.y[si], pz = cur.z[si], hx = px + offsets[oi * 3], hy = py + offsets[oi * 3 + 1], hz = pz + offsets[oi * 3 + 2];
          const ex = (key >>> 20) - 2048, ey = ((key >>> 12) & 0xff) - 128, ez = (key & 0xfff) - 2048;
          const warps = cur.warps[si] + warpsOf(px, py, pz, hx, hy, hz), jumps = cur.jumps[si] + 1, straight = straightOf(hx, hy, hz, ex, ey, ez);
          let cost = warps + jumps + straight;
          if (mode === "force" || mode === "wide") {
            const stretch = deepStretch({ x: ex, y: ey, z: ez }, to, range);
            if (stretch) cost = Math.min(cost, warps + jumps + stretch.warps + stretch.jumps);
          }
          if (cost < bestCost && (!closer || away(ex, ey, ez) < startAway - 1)) { best = { depth, at: next.n }; bestCost = cost; improved = true; }
          const n = next.n++;
          next.x[n] = ex; next.y[n] = ey; next.z[n] = ez; next.warps[n] = warps; next.jumps[n] = jumps; next.parent[n] = si; next.offset[n] = oi;
        }
        layers.push(next);
        cur.warps = cur.jumps = null;      // only the positions and parents are needed to lay the route out
        cur = next;
        stalled = improved ? 0 : stalled + 1;
        timing.here += clock() - t;
        if (onDepth && (await onDepth(depth, bestCost, { chains: cur.n, kept: K, checked, seconds: (performance.now() - began) / 1000, all: level.all, cuts, peak })) === false) return null;
      }
      // the chain back from the best landing. The holes are the card's choices; each exit is recalculated here, so the laid-out route counts its own warps
      const chain = [];
      if (best) {
        for (let d = best.depth, i = best.at; d >= 1; d--) {
          const L = layers[d], prev = layers[d - 1], si = L.parent[i], oi = L.offset[i];
          chain.unshift({ hole: { x: prev.x[si] + offsets[oi * 3], y: prev.y[si] + offsets[oi * 3 + 1], z: prev.z[si] + offsets[oi * 3 + 2], index: BLACK_HOLE_INDEX }, landed: { x: L.x[i], y: L.y[i], z: L.z[i] } });
          i = si;
        }
      }
      const steps = [];
      let at = from;
      for (const link of chain) {
        const { hole } = link, radius = Math.hypot(hole.x, hole.y, hole.z);
        let exit = flown.get(`${hole.x},${hole.y},${hole.z}`), kind = "flown";
        if (!exit) { exit = blackHoleExit(g, hole.x, hole.y, hole.z) || { g, ...link.landed, index: 1 }; kind = radius >= EXIT_TESTED_REGIONS ? "calculated" : "guess"; }
        if (!sameStar(at, hole)) steps.push(legOf(at, hole, range));
        steps.push({ type: "jump", from: hole, to: exit, kind });
        at = exit;
      }
      const stretch = closer ? deepStretch(at, to, range) : null;
      let tail = 0;
      if (stretch) steps.push(stretch);
      else if (!sameStar(at, to)) { const l = legOf(at, to, range); steps.push(l); tail = l.warps; }
      const straight = sameStar(from, to) ? [] : [legOf(from, to, range)];
      const warpCount = list => list.reduce((n, step) => n + (step.warps || 0), 0), jumpCount = list => list.reduce((n, step) => n + (step.type === "jump" ? 1 : step.jumps || 0), 0);
      let used = steps;
      if (mode === "plain" && chain.length && warpCount(steps) + chain.length >= warpCount(straight)) used = straight;
      const warps = warpCount(used), jumps = jumpCount(used);
      const route = { g, from, to, range, direct: warpCount(straight), total: warps + jumps, warps, jumps, steps: used, forced: mode !== "plain", widened: mode === "wide",
        gpu: { level: level.label, chains: K, checked, depth: layers.length - 1, seconds: (performance.now() - began) / 1000, timing, all: level.all, cuts, peak, reach } };
      if (mode === "only") Object.assign(route, { only: true, same: false, tail: used === steps ? tail : 0 });
      return route;
    } finally {
      for (const b of buffers) b.destroy();
    }
  }

