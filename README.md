# Expanded web map algorithms — source excerpts

This package contains **only algorithm and arithmetic excerpts from our frozen web app**, `NMS-MAP-STANDALONE/reference/web-build-2026-11-04/nms/voyage/voyage.js`. Each excerpt preserves its exact source lines; `MANIFEST.json` records the original line ranges and SHA-256 hashes.

| File | Contents |
|---|---|
| `source/black-hole-exit.js` | Seeded exit stream and inferred black-hole destination arithmetic |
| `source/route-planner.js` | Warp waypoints, beam route planning, deep-core estimates and destination-ending search |
| `source/find-search.js` | Candidate system numbers, region filtering and nearby search |
| `source/name-search.js` | Reverse system-name search and planet-name confirmation |
| `source/name-compiler-and-gpu.js` | Integer draw-range compilation and WebGPU whole-galaxy name scan |
| `source/gpu-route.js` | WebGPU black-hole route search |
| `source/pre-release-name-parser.js` | Pre-release name normalization |

These are **reference fragments**, not a runnable app. They use base map generator and browser helpers that are deliberately absent. The original site's address packing, generator, name tables, HTML, CSS, image/font assets and third-party libraries are not included. No save, voyage, player or catalogue data is included.

The black-hole exit formula and near-core estimates are inferred from recorded jumps and have stated uncertainty in the source comments. Do not treat them as guaranteed game behavior.

No license is asserted for this package. Confirm ownership and choose terms before public distribution.
