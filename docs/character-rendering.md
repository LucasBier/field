# Character and room rendering

Nia is rendered from `public/characters/nia-v2.glb`: one skinned character with embedded PBR maps, five motion clips, Draco geometry and WebP textures. The download remains below 6 MB. Geometry decoders and room textures ship with the website; visitors need no modeling account.

## Body and contact

`lib/companion-model.ts` preserves imported transforms, materials and skinning, normalizes height to 1.68 meters, crossfades standing motions and releases GPU resources. Downloads are cancellable, time bounded and capped at 64 MB. External texture and buffer dependencies are rejected. `Idle`, `Walk`, `Wave`, `Sit` and `Stand` share one skeleton. Wave runs once. Standing transitions are sampled forward to rise and backward to settle.

`lib/companion-interaction.ts` combines the body clips with furniture contact. Seated hips align with the cushion or chair, while analytic two-bone IK plants the feet and places the wrists. Elbow and knee poles constrain the bend direction without stretching the skeleton. Wrist-to-finger axes are inferred from the hand-weighted vertices instead of assuming a rig convention. Reading adds an open book with a turning page and directs the gaze at it; desk activity places the wrists over the keyboard with alternating movement and a visible screen cursor. All offsets reset before the next animation evaluation, so procedural changes cannot accumulate.

There is no finger rig, lip synchronization, cloth simulation or physical grasp solver. Desk activity is a visual activity; it does not execute code or modify files. Reading does not ingest a real book. These activities do not imply completion of a task in the persistent agent workspace.

## Activities and navigation

`lib/room-activities.ts` is an interruptible activity controller with free, walking, settling, active and leaving phases. Each activity declares a clear approach point, furniture anchor, facing and optional seat height. Walking uses `lib/room-navigation.ts`: a bounded grid search, body clearance, diagonal collision checks and visible-path smoothing. Only seating transitions can enter a furniture footprint.

Activities include reading, desk work, resting, looking out of the window and stretching. Selecting a sofa cushion, monitor or chair starts its activity; the activity selector exposes all choices. A valid floor tap or keyboard input leaves the current seat before movement. Invalid destinations preserve the current activity. Requests received while rising replace the pending destination.

“Let Nia choose” advances a local activity sequence after quiet intervals. Manual choices take priority. Background tabs stop advancing; busy conversations suspend autonomous selection, and reduced-motion preferences disable it. Reduced motion uses stable activity poses, stops page/cursor movement and moves directly along the selected route. This controller is a browser presentation behavior, not model inference or a background service.

Camera, exact positions and activities are session state. Explicit floor and keyboard movement report the nearest persisted center, desk or window zone; autonomous presentation does not write user actions or fabricate conversation memories.

## Room and layout

`lib/studio-room.ts` builds a furnished apartment with wood and plaster PBR materials, a sofa, desk, bookcase, kitchen, glazing, curtains, plants and practical lights. Day, golden-hour and night presets change real light sources and exposure. The record player produces local synthesized audio only after user action; backgrounding the page stops it.

The canvas, activity controls, tools and chat composer occupy separate layout rows. The phone view follows Nia within the reserved canvas area. Expanding room settings consumes layout space instead of covering the character. Short screens can scroll rather than squeezing the scene beneath a fixed overlay. Orbit, pan, zoom, portrait and follow views remain available without pointer lock.

## Validation

Tests cover model grounding and resource cleanup, required embedded clips and PBR maps, analytic IK under transformed parents, all activity-to-activity routes, invalid targets, seated interruption, pending-command replacement and autonomy suspension. Native renders inspect actual runtime-skinned geometry in the actual room layout. They do not establish browser frame rate or device compatibility.

## Conversation connection

The public interface displays Nia’s connection state without exposing a model identifier. Unconnected conversation is not replaced by canned persona dialogue: the message stays in the composer and an explicit connection notice appears. Movement, note/task commands and explicit memory saves remain usable without inference. Legacy stored `demo` discriminators remain readable for data compatibility; they are presented as room actions. A model identifier belongs in private operator configuration. A label change is not evidence of model training.
