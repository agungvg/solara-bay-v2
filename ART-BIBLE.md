# SOLARA BAY — ART BIBLE v2

A modern coastal city for an open-world crime game. The reference plaza is
the quality bar: a lived-in stone square, a fountain, cloth banners on stone
walls, striped market stalls, thick green trees, a cobbled footbridge, warm
sunlight on everything. Solara Bay keeps that richness and warmth, but the
setting is present-day: cars, police, a working harbour, a beach, towers.

## What we steal from where

- **The reference plaza** — density and warmth. Stonework with visible
  joints, banners, stalls, trees, water. Borrow the *craft*, not the era.
- **Modern coastal crime games** — the geography of the genre: a downtown
  spine, a market square, a container harbour, a beachfront boulevard, a
  police precinct. Borrow the *map logic*.
- **Stylised city art direction** — one locked palette, painted textures,
  exaggerated silhouettes, long shadows, fog the colour of the horizon.
  Borrow the *discipline*.

## One technique

Stylised daylight: `MeshStandardMaterial`, canvas-painted textures, plain
Three.js geometry. No toon shading, no photoreal detail, no photographs, no
downloads at runtime, no outside assets. If a surface needs detail, paint
it; if a shape needs to read at a glance, model it big and simple.

## Locked palette

Warm daylight, not sunset. The sun is high enough to be bright, low enough
to throw long shadows.

| Swatch | Hex | Where it lives |
|---|---|---|
| Day sky | `#5E9BD6` | Dome zenith, hemisphere sky |
| High haze | `#8FC3E8` | Dome upper band |
| Warm horizon | `#FFE9C4` | Dome horizon, fog, haze |
| Sunlight | `#FFE3B0` | Key light, sun disc, glitter |
| Cream wall | `#EFDDB2` | Plaster facades |
| Sandstone | `#DDBB8E` | Plaza buildings, arch, trim |
| Brick | `#A95F43` | Brick facades |
| Terracotta | `#C4744E` | Terracotta facades |
| Sage wall | `#9FB27F` | Residential facades |
| Tower glass | `#6B8CA3` | Downtown glass |
| Coral wall | `#D98A6B` | Accent facades |
| Road black | `#33363C` | Asphalt |
| Pavement | `#C2B49A` | Sidewalks, base ground |
| Square stone | `#D3BC90` | Plaza paving, bridge |
| Palm leaf | `#2F8F46` | Palm fronds |
| Leaf light | `#6FBE4E` | Grass, light leaves |
| Deep leaf | `#3E7A34` | Broadleaf, bushes |
| Deep sea | `#0A5468` | Ocean far |
| Shallow sea | `#2EA6B6` | Ocean near shore, fountain |
| Surf white | `#EAF6F2` | Foam, spray |
| Dry sand | `#E9D49B` | Beach |
| Damp sand | `#D3B26E` | Waterline band |
| Grey stone | `#8B9096` | Boulders, kerbs |
| Timber | `#8A6A45` | Stalls, pier, crates |
| Harbour red | `#A83A2C` | Containers |
| Harbour blue | `#2E5CB0` | Containers |
| Harbour green | `#3A9E5C` | Containers |
| Signal yellow | `#E8C832` | Hazards, dashes, crane |
| Neon pink | `#FF5C8A` | Hero signs only |
| Neon cyan | `#37D6E0` | Hero signs only |
| Window gold | `#FFD166` | Lit windows, sign lettering |

Roughly 60% warm walls + sky + sand, 30% road / glass / green, 10%
accent (neon, gold, flowers). Never pure white or pure black.

## Mood words

Sunlit, golden-hour, humid, buzzing, lived-in, bright. A hot afternoon
that is ending: shadows are long, the sea sparkles, the square is busy.

## Light and air

- **Key:** one directional light, `#FFE3B0`, strength about 2.8, from the
  south-east, roughly 26° up. South faces catch the light, which is what
  the spawn view looks at. Shadow map 2048, covering the whole city.
- **Fill:** hemisphere, sky `#CFE4FF`, ground `#9A7B52`, about 0.9. Warm
  key against cool fill; shadows stay coloured, never black.
- **Sky:** shader dome, four bands from `#5E9BD6` down to `#FFE9C4`, sun
  disc and glow on the same bearing as the key light.
- **Fog:** exponential, `#FFE0B0`, density near 0.0015. The far skyline
  dissolves; the street in front of the camera stays sharp.
- **Exposure (for the integration step):** ACES filmic, exposure about
  1.15. The old build's complaint was a dim, flat picture — brightness
  is a requirement, not a preference. If a shot reads dim, raise the
  exposure and the sun, never add flat ambient light.
- **Glow:** only hero signs and lit windows are allowed to be emissive,
  and only in the accent colours. If everything glows, nothing does.
- **Camera far** must be at least 1200; the sky dome sits at radius 850.

## Districts

Six, each readable in a single screenshot with the HUD off:

1. **Downtown** (centre-north): the tall glass and stone towers, the
   tallest one carrying a red beacon. Billboards on the south faces.
2. **The Square** (the middle of the map): stone paving, a two-tier
   fountain, a water channel with a cobbled footbridge, a market arch,
   stalls, banners, flower beds. This is the spawn view and the hero.
3. **Harbour** (south, around z 130): concrete yard, painted
   containers, a portal crane, a timber pier reaching into the sea.
4. **Beachfront** (south edge): palms, umbrellas, a beach bar, boulders,
   wet sand, and the shader ocean past the waterline.
5. **Homes** (the edges): low houses with pyramid roofs, gardens,
   broadleaf trees, warm colours.
6. **Greens** (two park blocks): lawn, broadleaf trees, grass tufts,
   benches.

## Building rules

- Three height families: houses 1–2 floors, mid blocks 3–6, towers
  8–16. Heights alternate along a street — low, mid, tower, mid, low —
  never a flat wall of the same height.
- Every facade is painted as one whole elevation: windows sized to the
  building's real floor count, a cornice at the top, a shopfront or a
  doorway at the bottom. No stretched texture, no bare wall.
- Lit windows vary per building (roughly one in ten up to one in three
  lit). A block that is all lit or all dark looks dead.
- Every roof is finished: a parapet cap on flat roofs, a pyramid roof
  on houses, plus air-conditioning boxes, water tanks and antennae on
  the taller blocks. No bare flat top.
- Ground floors matter most: a shopfront (glass, awning, painted sign)
  or a deliberate plain front (wall, posters, bin, plant). Never a
  blank stretched wall.

## Props and planting

- Eight prop families, repeated everywhere: stalls, crates, bins,
  planters, benches, hydrants, lamps, bollards. Cluster them at corners
  and shopfronts; leave clean stretches between clusters.
- Palms line the avenues and the beachfront; broadleaf trees live in
  the parks and gardens; grass tufts, flowers and bushes fill the gaps.
  Repeats are instanced — one draw call per family, not per plant.
- Every prop sits on the ground or is visibly half-buried. Nothing
  floats. Big boulders sink a third of their height into the sand.

## Do

- Keep the palette locked; a new asset takes the nearest colour on it.
- Warm key, cool fill, long shadows, fog the colour of the horizon.
- Finish ground floors and rooftops; vary lit windows.
- Cluster props; plant palms in lines, never scattered singles.
- Instance every repeat; keep the city well under 300 draw calls.
- Screenshot-critique every change: spawn view, main avenue, beach,
  market street.

## Do not

- No pure white or pure black; no photographs; no new colour per asset.
- No photoreal micro-detail; no fiddly modelled trim.
- No all-lit or all-dark blocks; no bare flat roofs.
- No neon on everything; no flat midday sun; no uniform fog.
- No uniform clutter, no empty dead streets, no edges that only just
  touch.
- No network, no outside assets, no reused work from the earlier build
  — every line here and in `game/src/city.js` is written fresh for v2.

## Checks before calling it done

1. Grey-scale squint: road, buildings, player and markers all readable.
2. Thumbnail: each of the four main views reads at a glance.
3. Palette audit: every sampled colour is on the locked list or a blend
   of two of them.
4. Brightness: the street reads bright and clear, not dim or washed out.
5. Performance: draw calls under 300, 60 fps target on a desktop.
6. Offline: zero requests after load; deterministic for a fixed seed.
