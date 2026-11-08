# Algorithms and arithmetic

The source files preserve exact excerpts from the web application (https://crowbarsworkshop.com/nms/). This note summarizes their main inputs, outputs and limits. The map's base address/generator API is an external dependency and is deliberately not supplied here, sorry.

## Black-hole exit inference

`blackHoleExit(g, x, y, z, index)` seeds the map's generator from the hole address and consumes three draws `u0`, `u1`, `u2`. It predicts an exit radius of `hypot(x,y,z) - (13.25 + 3.5*u0)`, bearing `2*pi*u1`, height `round(4 - 8*u2)`, and system number `floor(120*u0)+1`. The planar radius is `sqrt(max(exitRadius^2 - height^2, 0))`; rounded X/Z coordinates are clamped to the galaxy bounds. The result marks a `hyper` exit when clamping occurred. The constants are fitted/inferred from recorded jumps, with documented errors near the core.

## Warp and black-hole routes

`warpsBetween` estimates a direct leg as `ceil(400*regionDistance/warpRange)`, with at least one warp for distinct stars. `warpLine` chooses integer-region stops near the straight line, as far forward as each jump can reach. `searchRoute` keeps a beam of candidate black-hole chains, compares them with a straight warp route, and builds a sequence of warp/jump steps. `searchOnly` looks for an all-black-hole chain; `exitsInto` and `searchEnding` search for a landing in the destination system or region. `deepStretch`/`deepOnly` estimate the final core approach where the exit formula is unreliable.

## Nearby system finding

`findNumbers` enumerates the system-number bands worth checking for each requested kind. `regionMatches` asks the base generator about those candidates and caches matches. `findRows` takes nearby regions and returns the nearest matching systems, sharing its row budget across kinds. `holesAround` enumerates valid regions in a sphere around the query point.

## Reverse name search

`nameRawForms` reverses the generator's vowel cleanup into possible raw spellings. `nameTargets` normalizes requested names. `nameSearch` checks candidate addresses in increasing region distance and compares generated names. Planet matching first filters by the cheaper system description, then names bodies for surviving systems.

## GPU name and route search

The name compiler maps each target spelling into a short program of generator-draw constraints. For a draw converted to `floor(n*u) == k`, `drawRange` computes the inclusive 32-bit integer interval that yields `k`, correcting float-rounding boundaries. The WebGPU kernel tests those programs across slices of a galaxy; the CPU names reported hits again. The route kernel searches many black-hole landings per layer, counts scores to choose a cutoff, keeps winning exits once, and reconstructs the chain on the CPU.

## Pre-release names

`preReleaseForm` removes old suffix and spelling forms to produce a searchable name stem. Its wiki list and user interface text are excluded; the parser therefore requires a caller-supplied `NAME_PRE` lookup.

These are **reference fragments**. Constants, helper functions and data from the original map are absent; see each excerpt's original line ranges in `MANIFEST.json`.
