# Character and room rendering

The browser renders Zuri from `public/characters/zuri-v2.glb`. The asset contains its geometry, skeleton, animation clips, 4K color texture and PBR maps. Draco geometry compression and WebP textures keep the download below 6 MB without simplifying the rigged geometry. Decoders and room textures ship with the site; visitors do not need a modeling account or an external asset service.

## Character contract

`lib/companion-model.ts` specifies the versioned asset, physical height, orientation and named clips. The loader preserves the imported material maps and skinning hierarchy, grounds the body in meters, crossfades animation states and releases textures, skeletons, image bitmaps and GPU geometry on teardown. Downloads are cancellable, time bounded and limited to 64 MB. External texture and buffer dependencies are rejected.

`Idle`, `Walk` and `Wave` share one skeleton. Walking is in place; the room controller supplies world translation. Wave plays once. A missing optional pose uses idle; a clip explicitly named in the asset specification but absent from the file fails loading. Reduced motion displays the initial idle pose and moves directly to a requested destination. No facial or speech animation is implied by the body clips.

## Room and navigation

`lib/studio-room.ts` builds a furnished apartment with wood and plaster PBR materials, reading furniture, a desk, books, kitchen island, glazing, curtains, plants and practical lights. The day, golden-hour and night presets change actual light sources, exposure and the outdoor backdrop. Lamp and curtain controls also work by selecting those objects. The record player starts a quiet, locally synthesized loop only after a user action and stops sound when the page becomes hidden.

`lib/room-navigation.ts` is the shared source for furniture footprints and navigation bounds. A bounded grid search reserves clearance around obstacles, checks diagonal segments and smooths only collision-free parts of the path. Clicking open floor chooses an exact destination. Keyboard movement is scoped to the focused canvas and uses the same clearance checks. Orbit, pan, zoom, portrait and following views do not require pointer lock.

Free movement coordinates, camera and room controls are session presentation state. The persisted agent location remains one of the existing center, desk or window zones. Floor and keyboard movement report the nearest zone; agent-directed zone changes still move toward their named anchors. This is a navigable room, not a physics simulation: furniture cannot be dragged, body animations do not manipulate objects, and sitting and cloth dynamics are not implemented.

## Validation

`tests/companion-model.test.ts` covers grounding, imported materials, animation transitions, reduced motion, cleanup and GLB parsing. `tests/room-navigation.test.ts` checks reachability, furniture detours and invalid destinations. Asset validation includes the binary container, embedded resources, required clips and the published digest. Native 3D renders inspect the character and room; these do not establish browser frame rates or replace device testing.
