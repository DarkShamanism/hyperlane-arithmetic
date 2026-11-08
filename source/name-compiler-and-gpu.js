// Exact source excerpts from nms/voyage/voyage.js, frozen 2026-11-04.
// Reference fragments: omitted base generator and UI helpers remain external.

// Original lines 2767-3123
  // ---- whole-galaxy name search on the graphics card. Each typed name becomes a set of short check lists: after the first three draws (which pick the
  // word's alphabet and first three letters, and so which lists apply), every later draw must fall in an exact range for the name to come out. Ranges are
  // worked out here with the same float rules as the generator, so the card only ever compares whole numbers, and every match is named again here ----
  const OP_STEP = 1, OP_RANGE = 2, OP_BIT = 3, U32_MAX = 4294967295;
  // the draws n that give int(n) === k: lo32 from ceil(k * 2^32 / n) up to just below the next
  function drawRange(n, k) {
    const at = j => { let lo = Math.ceil(j * TWO32 / n); while (lo > 0 && Math.floor((lo - 1) * n / TWO32) >= j) lo--; while (Math.floor(lo * n / TWO32) < j) lo++; return lo; };
    return [at(k), k + 1 >= n ? U32_MAX : at(k + 1) - 1];
  }
  // the smallest lo32 whose value under fn is at least want; fn never decreases as lo32 grows
  function firstAtLeast(fn, want) {
    let a = 0, b = TWO32;
    while (a < b) { const m = Math.floor((a + b) / 2); if (fn(m) >= want) b = m; else a = m + 1; }
    return a;
  }
  // the draws that pick letter K from a table, by the walk's rounding rule or its running total
  function letterRange(weights, K, round) {
    const pick = round
      ? lo => { const f = Math.fround(Math.fround(lo / TWO32) * (weights.length - 1)); return Math.trunc(Math.fround(Math.fround(0.5) + f)); }
      : lo => { const f = Math.fround(lo / TWO32); let t = 0, e = 0; for (; e < weights.length; e++) { t = Math.fround(t + weights[e][1]); if (t >= f) break; } return e; };
    const a = firstAtLeast(pick, K), b = firstAtLeast(pick, K + 1) - 1;
    return a <= b && a <= U32_MAX ? [a, Math.min(b, U32_MAX)] : null;
  }
  const opsRange = (n, k) => [OP_STEP, OP_RANGE, ...drawRange(n, k)];
  // the letter walk, followed the way the generator goes: one draw per step, a step on a missing table moving to the next alphabet, and after 8 of
  // those either an early end (fewer than 3 letters left) or a fresh start spliced in, with an apostrophe or a vowel. raw decides every letter,
  // so this only branches where raw allows more than one reading. Returns the draws' checks for each way that ends exactly on raw
  function walkWord(raw, group, count, round) {
    const results = [];
    const go = (i, g, misses, r, left, ops) => {
      while (r < count) {
        ops = [...ops, OP_STEP];
        const weights = nameWeightsOf(i.substring(r, r + 3), g);
        if (!weights) {
          misses--; r--; g = (g + 1) % 8;
          if (misses === 0) {
            if (left < 3) break;
            const rest = raw.slice(i.length), prev = i[r + 2], list = nameStarts[g], size = list.length / 3, vowel = c => NAME_VOWELS.includes(c);
            const tries = [
              { a: rest.slice(1, 4), add: rest.slice(0, 4), v: -1, ok: rest[0] === "'" && vowel(prev) && vowel(rest[1]) },
              { a: rest.slice(1, 4), add: rest.slice(0, 4), v: NAME_VOWELS.indexOf(rest[0]), ok: vowel(rest[0]) && rest.length >= 4 && !vowel(rest[1]) },
              { a: rest.slice(0, 3), add: rest.slice(0, 3), v: -1, ok: vowel(rest[0]) && !vowel(prev) },
            ];
            for (const t of tries) {
              if (!t.ok || t.a.length < 3) continue;
              for (let k = 0; k < size; k++) {
                if (list.substr(k * 3, 3) === t.a) go(i + t.add, g, 1, r + 3, left - 3, [...ops, ...opsRange(size, k), 0, ...(t.v >= 0 ? [...opsRange(5, t.v), 0] : [])]);
              }
            }
            return;
          }
        } else {
          const want = raw[i.length];
          if (want === undefined) return;
          const picks = weights.map((w, K) => (w[0] === want ? letterRange(weights, K, round) : null)).filter(Boolean);
          if (!picks.length) return;
          if (picks.length > 1) { for (const range of picks) go(i + want, g, misses, r + 1, left - 1, [...ops, OP_RANGE, ...range, 0]); return; }
          ops = [...ops, OP_RANGE, ...picks[0], 0];
          i += want;
          left--;
        }
        r++;
      }
      if (i === raw) results.push(ops);
    };
    go(raw.slice(0, 3), group, 8, 0, count, []);
    return results;
  }
  // check lists for one word after its first letters are drawn: the rounding flag, the drawn length, the walk, then the vowels cleanup adds.
  // Every drawn length is tried, as an early end or a splice can leave the word shorter or longer than drawn. force: a raw length used in place of the drawn one
  function wordChecks(raw, word, group, lo, hi, force) {
    const out = [];
    for (const length of force ? [force] : Array.from({ length: hi - lo + 1 }, (_, j) => lo + j)) for (const round of [0, 1]) {
      const head = [OP_STEP, OP_BIT, round, 0, ...(force ? [OP_STEP] : [...opsRange(hi + 1 - lo, length - lo), 0])];
      for (const walk of walkWord(raw, group, length - 3, round)) out.push(...cleanupChecks(raw, word, [...head, ...walk]));
    }
    return out;
  }
  // cleanup: each step that adds a vowel draws it (and the middle one draws where), so try every choice and keep those that give the word
  function cleanupChecks(raw, word, ops) {
    {
      let branches = [{ text: raw, ops }];
      const grow = (needs, place) => {
        const next = [];
        for (const b of branches) {
          const spots = needs(b.text);
          if (!spots) { next.push(b); continue; }
          for (const [k, at] of spots) for (let v = 0; v < 5; v++) {
            const text = b.text.slice(0, at) + NAME_VOWELS[v] + b.text.slice(at);
            next.push({ text, ops: [...b.ops, ...(k === null ? [] : [OP_STEP, OP_RANGE, ...drawRange(3, k), 0]), OP_STEP, OP_RANGE, ...drawRange(5, v), 0] });
          }
        }
        branches = next.filter(b => place(b.text));
      };
      grow(e => { const n = e[0], r = e[1]; if (NAME_VOWELS.includes(n) || NAME_VOWELS.includes(r)) return null;
        const okStart = (n === "s" && "hklmnprtwy".includes(r)) || (r === "h" && "ctw".includes(n)) || (r === "l" && "bcfgps".includes(n)) || (r === "r" && "bcdfgkpt".includes(n)) || (r === "w" && "dgt".includes(n)) || (r === "y" && "hmr".includes(n));
        return okStart ? null : [[null, 1]]; }, () => true);
      grow(e => { if (e.length <= 1) return null; const n = e[e.length - 1], r = e[e.length - 2];
        const fix = (r !== "g" || NAME_VOWELS.includes(n)) && ((n === "b" && "gn".includes(r)) || (n === "d" && "bdfghkmpst".includes(r)) || (n === "g" && r === "l") || (n === "p" && "bdhkt".includes(r)) || (n === "r" && "bfg".includes(r)) || (n === "t" && r === "g") || (n === "w" && !NAME_VOWELS.includes(r)));
        return fix ? [[null, e.length - 1]] : null; }, () => true);
      grow(e => { let t = 0; for (let n = 0; n < e.length; n++) { if (t < 3) t = NAME_VOWELS.includes(e[n]) ? 0 : t + 1; else { if (!"aeiouy".includes(e[n])) return [0, 1, 2].map(k => [k, n - 3 + k + 1]); t = 0; } } return null; }, text => text === word);
      return branches.map(b => b.ops);
    }
  }
  // a second part: its own alphabet and start, drawn after the hyphen
  function secondChecks(second) {
    const out = [];
    for (const raw of nameRawForms(second).filter(r => r.length >= 3 && r.length <= 5)) {
      for (let p = 0; p < 5; p++) {
        const g = p < 4 ? p + 2 : 7, list = nameStarts[g], size = list.length / 3;
        for (let k = 0; k < size; k++) {
          if (list.substr(k * 3, 3) !== raw.slice(0, 3)) continue;
          for (const ops of wordChecks(raw, second, g, 3, 5)) out.push([...opsRange(5, p), 0, ...opsRange(size, k), 0, ...ops]);
        }
      }
    }
    return out;
  }
  // what follows the first word: the hyphen decision and second part under each rule, then the numeral
  function tailChecks(target, mainLength) {
    const shape = target.form || target.full, [, second] = shape.split(" ")[0].split("-"), numeral = (shape.match(/ ([IVXLC]+)$/) || [])[1];
    const romanValue = numeral ? Array.from({ length: 19 }, (_, i) => i + 1).find(n => nameRoman(n) === numeral) : 0;
    if (numeral && !romanValue) return [];
    const end = numeral ? [OP_STEP, OP_RANGE, 0, NAME_NUMERAL_ODDS - 1, 0, ...opsRange(19, romanValue - 1), 0] : [OP_STEP, OP_RANGE, NAME_NUMERAL_ODDS, U32_MAX, 0];
    const lists = [];
    for (const longest of [7, 8]) {
      if (mainLength <= longest) {
        if (second) for (const ops of secondChecks(second.toLowerCase())) lists.push([...opsRange(100, 0).slice(0, 1), OP_RANGE, 0, drawRange(100, 49)[1], 0, ...ops, ...end]);
        else lists.push([OP_STEP, OP_RANGE, drawRange(100, 50)[0], U32_MAX, 0, ...end]);
      } else if (!second) lists.push(end);
    }
    const seen = new Set();
    return lists.filter(l => { const key = l.join(); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  // every check list for the names typed, keyed by alphabet and first three letters. loose: the first word is enough
  function compileNames(targets, loose) {
    const programs = [], unsupported = [];
    for (const target of targets) {
      const word = target.main, before = programs.length;
      for (const force of target.force) {
        for (const raw of nameRawForms(word)) {
          if (raw.length < 3) continue;      // the walk decides which drawn lengths can give it
          const tails = loose ? [[]] : tailChecks(target, word.length);
          for (const g of [2, 3, 4, 5, 7]) {
            const list = nameStarts[g], size = list.length / 3;
            for (let k = 0; k < size; k++) {
              if (list.substr(k * 3, 3) !== raw.slice(0, 3)) continue;
              for (const most of force ? [0] : [6, 7, 8, 9]) {
                const v2 = force ? [0, U32_MAX] : drawRange(4, most - 6);
                for (const ops of wordChecks(raw, word, g, 6, force ? 9 : most, force || 0)) {
                  for (const tail of tails) programs.push({ target, force, group: g, start: k, v2, ops: [...ops, ...tail] });
                }
              }
            }
          }
        }
      }
      if (programs.length === before) unsupported.push(target);
    }
    return { programs, unsupported };
  }

  // the card's side: every region of a galaxy against every system number, in slices of 16.7 million regions. 64-bit draws are done as pairs of 32-bit
  // halves, as WebGPU has no 64-bit integers. Hits come back as region, system number and check list, and are named again on this side
  const GPU_SLICE = 1 << 24, GPU_KEEP = 4 << 20;       // regions per pass; hits one pass can hold before it's split and run again
  const GPU_KERNEL = `
struct Params { regionBase: u32, regionCount: u32, galaxy: u32, nIndices: u32, maxOut: u32, rowWidth: u32, pad1: u32, pad2: u32,
  sizes: array<vec4<u32>, 2>, bases: array<vec4<u32>, 2>, spans: vec4<u32> }
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(2) var<storage, read> bucketStart: array<u32>;
@group(0) @binding(3) var<storage, read> bucketList: array<u32>;
@group(0) @binding(4) var<storage, read> progOffset: array<u32>;
@group(0) @binding(5) var<storage, read> prog: array<u32>;
@group(0) @binding(6) var<storage, read_write> outCount: atomic<u32>;
@group(0) @binding(7) var<storage, read_write> outHits: array<u32>;
@group(0) @binding(8) var<storage, read> usedBits: array<u32>;
var<workgroup> used: array<u32, 1024>;
const MULT: u32 = 1517746329u;
fn mul64(a: u32, b: u32) -> vec2<u32> {
  let a0 = a & 0xFFFFu; let a1 = a >> 16u; let b0 = b & 0xFFFFu; let b1 = b >> 16u;
  let p00 = a0 * b0; let p01 = a0 * b1; let p10 = a1 * b0; let p11 = a1 * b1;
  let mid = (p00 >> 16u) + (p01 & 0xFFFFu) + (p10 & 0xFFFFu);
  return vec2<u32>((p00 & 0xFFFFu) | (mid << 16u), p11 + (p01 >> 16u) + (p10 >> 16u) + (mid >> 16u));
}
// int(n) for n below 65536: the top half of lo * n, from two 16-bit pieces
fn drawSmall(lo: u32, n: u32) -> u32 { return ((lo >> 16u) * n + (((lo & 0xFFFFu) * n) >> 16u)) >> 16u; }
fn step(s: vec2<u32>) -> vec2<u32> {
  let m = mul64(s.x, MULT); let lo = m.x + s.y;
  return vec2<u32>(lo, m.y + select(0u, 1u, lo < m.x));
}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  // which alphabet-and-start keys have any checks, copied into fast workgroup memory first
  for (var w = li; w < 1024u; w += 256u) { used[w] = usedBits[w]; }
  workgroupBarrier();
  let flat = id.x + id.y * P.rowWidth;
  if (flat >= P.regionCount) { return; }
  let t = P.regionBase + flat;
  if ((t & 0xFFFu) == 0x800u || ((t >> 12u) & 0xFFFu) == 0x800u || (t >> 24u) == 0x80u) { return; }
  let lo0 = select(t, 1u, t == 0u);
  let mixed = t ^ ((t << 16u) | (t >> 16u));
  let first = mul64(lo0, MULT);       // the first step's product is the same for every system number in the region
  // system numbers in two spans: spans.x to spans.y, then spans.z to spans.w
  var s = P.spans.x;
  loop {
    if (s > P.spans.y && s < P.spans.z) { s = P.spans.z; }
    if (s > P.spans.w) { break; }
    let here = s;
    s += 1u;
    let lo1 = first.x + (((here << 8u) | P.galaxy) ^ mixed);
    let v1 = vec2<u32>(lo1, first.y + select(0u, 1u, lo1 < first.x));
    let p = drawSmall(v1.x, 5u);
    let g = select(7u, p + 2u, p < 4u);
    let v2 = step(v1);
    let v3 = step(v2);
    let key = P.bases[g / 4u][g % 4u] + drawSmall(v3.x, P.sizes[g / 4u][g % 4u]);
    if ((used[key >> 5u] & (1u << (key & 31u))) == 0u) { continue; }
    let b1 = bucketStart[key + 1u];
    var lastTarget = 0xFFFFFFFFu;
    for (var b = bucketStart[key]; b < b1; b++) {
      let pid = bucketList[b];
      let off = progOffset[pid];
      if (prog[off] == lastTarget || v2.x < prog[off + 1u] || v2.x > prog[off + 2u]) { continue; }
      var st = v3; var i = off + 4u; let end = i + prog[off + 3u]; var ok = true;
      loop {
        if (i >= end) { break; }
        let op = prog[i];
        if (op == 1u) { st = step(st); i += 1u; }
        else if (op == 3u) { if ((st.x & 1u) != prog[i + 1u]) { ok = false; break; } i += 3u; }
        else { if (st.x < prog[i + 1u] || st.x > prog[i + 2u]) { ok = false; break; } i += 4u; }
      }
      if (ok) {
        lastTarget = prog[off];
        let k = atomicAdd(&outCount, 1u);
        if (k < P.maxOut) { outHits[k * 3u] = t; outHits[k * 3u + 1u] = here; outHits[k * 3u + 2u] = pid; }
      }
    }
  }
}`;
  let gpuReady = null;
  function gpuDevice() {
    gpuReady ||= (async () => {
      if (!navigator.gpu) throw new Error("this browser has no WebGPU");
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) throw new Error("no graphics card was offered to the page");
      const limits = {};
      for (const name of ["maxStorageBufferBindingSize", "maxBufferSize"]) if (adapter.limits && adapter.limits[name]) limits[name] = adapter.limits[name];
      const device = await adapter.requestDevice({ requiredLimits: limits });
      device.lost.then(() => { gpuReady = null; });
      const module = device.createShaderModule({ code: GPU_KERNEL });
      const info = await module.getCompilationInfo();
      const bad = info.messages.filter(m => m.type === "error");
      if (bad.length) throw new Error(`the scan shader didn't compile: ${bad[0].message}`);
      const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "main" } });
      return { device, pipeline, name: [adapter.info && adapter.info.vendor, adapter.info && adapter.info.architecture].filter(Boolean).join(" ") || "graphics card" };
    })().catch(e => { gpuReady = null; throw e; });
    return gpuReady;
  }
  // the check lists packed for the card: lists sorted by alphabet and first letters, each with its target, the length draw's range and its ops
  function packChecks(programs) {
    const sizes = nameStarts.map(list => list.length / 3), bases = [];
    let total = 0;
    for (const n of sizes) { bases.push(total); total += n; }
    // within a key, one name's lists sit together, so the card can skip the rest of them once one passes
    const targetOf = new Map();
    for (const p of programs) if (!targetOf.has(p.target)) targetOf.set(p.target, targetOf.size);
    const keyOf = p => bases[p.group] + p.start;
    const order = programs.map((p, i) => i).sort((a, b) => keyOf(programs[a]) - keyOf(programs[b]) || targetOf.get(programs[a].target) - targetOf.get(programs[b].target));
    const bucketStart = new Uint32Array(total + 1), bucketList = new Uint32Array(Math.max(1, programs.length));
    for (const p of programs) bucketStart[bases[p.group] + p.start + 1]++;
    for (let k = 0; k < total; k++) bucketStart[k + 1] += bucketStart[k];
    order.forEach((pid, n) => { bucketList[n] = pid; });
    const words = [], offsets = new Uint32Array(Math.max(1, programs.length));
    programs.forEach((p, pid) => { offsets[pid] = words.length; words.push(targetOf.get(p.target), p.v2[0], p.v2[1], p.ops.length, ...p.ops); });
    const used = new Uint32Array(1024);
    for (let k = 0; k < total; k++) if (bucketStart[k + 1] > bucketStart[k]) used[k >> 5] |= 1 << (k & 31);
    return { sizes, bases, bucketStart, bucketList, offsets, used, words: new Uint32Array(words.length ? words : [0]) };
  }
  // every region of galaxy g. Returns { hits: [[region, index, pid]], regions, counts } or null when stopped; progress(fraction, hits).
  // Every match is counted by name, but past keepEach of one name only every 50th is kept, for checking
  async function gpuScan({ g, programs, indices, keepEach = Infinity, keepAll = Infinity }, progress, stopped) {
    const { device, pipeline } = await gpuDevice();
    const packed = packChecks(programs);
    const buffer = (data, usage) => { const b = device.createBuffer({ size: Math.max(16, data.byteLength), usage: usage | GPUBufferUsage.COPY_DST }); device.queue.writeBuffer(b, 0, data); return b; };
    const params = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const list = Uint32Array.from(indices);
    const buffers = [buffer(packed.bucketStart, GPUBufferUsage.STORAGE), buffer(packed.bucketList, GPUBufferUsage.STORAGE),
      buffer(packed.offsets, GPUBufferUsage.STORAGE), buffer(packed.words, GPUBufferUsage.STORAGE)];
    const usedBuffer = buffer(packed.used, GPUBufferUsage.STORAGE);
    const count = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    const out = device.createBuffer({ size: GPU_KEEP * 12, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const countBack = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const hitsBack = device.createBuffer({ size: GPU_KEEP * 12, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [params, null, ...buffers, count, out, usedBuffer].map((b, i) => (b ? { binding: i, resource: { buffer: b } } : null)).filter(Boolean) });
    const hits = [], counts = new Map(), zero = new Uint32Array(4), rowWidth = 16384 * 256;
    // the system numbers as at most two unbroken runs
    const runs = [];
    for (const n of list) { const last = runs[runs.length - 1]; if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]); }
    if (runs.length > 2) throw new Error("system numbers must be one or two unbroken runs");
    const spans = runs.length === 1 ? [runs[0][0], runs[0][1], runs[0][1] + 1, runs[0][1]] : [runs[0][0], runs[0][1], runs[1][0], runs[1][1]];
    const pass = async (base, n) => {
      const p = new Uint32Array(28);
      p.set([base >>> 0, n, g, list.length, GPU_KEEP, rowWidth, 0, 0]);
      p.set(packed.sizes.slice(0, 8), 8);
      p.set(packed.bases.slice(0, 8), 16);
      p.set(spans, 24);
      device.queue.writeBuffer(params, 0, p);
      device.queue.writeBuffer(count, 0, zero);
      const encoder = device.createCommandEncoder(), compute = encoder.beginComputePass();
      compute.setPipeline(pipeline);
      compute.setBindGroup(0, bind);
      compute.dispatchWorkgroups(Math.min(16384, Math.ceil(n / 256)), Math.ceil(n / rowWidth));
      compute.end();
      encoder.copyBufferToBuffer(count, 0, countBack, 0, 16);
      device.queue.submit([encoder.finish()]);
      await countBack.mapAsync(GPUMapMode.READ);
      const found = new Uint32Array(countBack.getMappedRange())[0];
      countBack.unmap();
      if (found > GPU_KEEP) {      // too many to hold: run the slice again in sixteen pieces
        for (let k = 0; k < 16; k++) await pass(base + k * (n / 16), n / 16);
        return;
      }
      if (!found) return;
      const copy = device.createCommandEncoder();
      copy.copyBufferToBuffer(out, 0, hitsBack, 0, found * 12);
      device.queue.submit([copy.finish()]);
      await hitsBack.mapAsync(GPUMapMode.READ, 0, found * 12);
      const words = new Uint32Array(hitsBack.getMappedRange(0, found * 12).slice(0));
      hitsBack.unmap();
      for (let k = 0; k < found; k++) {
        const pid = words[k * 3 + 2], target = programs[pid].target, n = (counts.get(target) || 0) + 1;
        counts.set(target, n);
        if ((n <= keepEach && hits.length < keepAll) || n % 50 === 0) hits.push([words[k * 3], words[k * 3 + 1], pid]);
      }
    };
    try {
      for (let base = 0; base < TWO32; base += GPU_SLICE) {
        if (stopped()) return null;
        await pass(base, GPU_SLICE);
        progress((base + GPU_SLICE) / TWO32, hits.length);
      }
    } finally {
      for (const b of [params, ...buffers, usedBuffer, count, out, countBack, hitsBack]) b.destroy();
    }
    return { hits, regions: TWO32, counts };
  }

  // ---- route search on the graphics card. The same jump-by-jump search as searchRoute, but it keeps thousands of landings per jump instead of 12, tries every black hole
  // within reach of each of them on the card, and ranks a landing by the moves it would take from there with black holes (two per jump still needed, about 15 regions
  // inward each) rather than by the straight line, which made the usual planner greedy about bearing. The card counts the landings at each score, this side reads the
  // counts to pick the exact cut, and only the winners come back, each exit kept once. Exits are worked out on the card in single precision, so the chosen holes are
  // kept and their exits recalculated here before the route is laid out ----
  const ROUTE_GPU_LEVELS = { fast: { label: "Fast", budget: 16 << 20, warps: 1 }, thorough: { label: "Thorough", budget: 96 << 20, warps: 2 }, extensive: { label: "Extensive", budget: 384 << 20, warps: 3 },
    entire: { label: "Entire map", budget: 8 * 2 ** 30, warps: 4, reach: 20, most: 1 << 20, all: true } };   // black holes tried per jump, and how many warps out the planner looks for them. all: every landing is kept, not the best few, while the card's table holds them
  const ROUTE_GPU_AUTO = ["thorough", "extensive"];      // what Auto runs after Fast, each replacing the route in view when it finds fewer moves
  const ROUTE_GPU_MOST = 1 << 18, ROUTE_GPU_LEAST = 64, ROUTE_GPU_STALL = 10, ROUTE_GPU_REACH = 16;   // landings kept per jump at most and at least; jumps without a better route before giving up; the farthest a black hole is looked for, in regions
  const ROUTE_GPU_ROW = 16384 * 256, ROUTE_GPU_F = 4096, ROUTE_GPU_TB = 256, ROUTE_GPU_COUNTERS = ROUTE_GPU_F + ROUTE_GPU_TB, ROUTE_GPU_TABLE = ROUTE_GPU_COUNTERS + 4;   // the work buffer's layout, in words

