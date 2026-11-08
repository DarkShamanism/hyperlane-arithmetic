# Provenance and comparison

## Examined

- Original live site: https://gyrconos.github.io/NMSGalaxyMap/. Its public source repository was unavailable, so the comparison uses its deployed site only.
- Our frozen web app: https://crowbarsworkshop.com/nms/

The original site ships its own compiled map JavaScript. The frozen app also ships a separate, readable `voyage/voyage.js` containing the Voyage Log, route and name-search algorithms. The original page did not reference that script when checked. This release excerpts algorithmic sections from that one frozen file and does not distribute either compiled map bundle.

## Selection rule

Included: functions and arithmetic for black-hole exit prediction, route and waypoint planning, nearby candidate search, reverse name search, GPU name/route search, planet-name confirmation and pre-release name parsing.

Excluded: HTML/CSS, UI rendering and controls, the original map's generator and structures, base name generator, data imports, user saves/POIs, name tables, images/fonts, and any native Rust or atlas-uplink code developed after the frozen web app.

## Limits

The upstream repository was not available for a line-by-line source comparison. The release is limited to the clearly identifiable `voyage.js` additions and makes no claim about authorship of the original site or of game data. The excerpts depend on omitted base-map helpers and are intended for review, not direct execution.
