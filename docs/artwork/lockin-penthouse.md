# Lock in: living manga penthouse v8

Built-in image_gen mode, original artwork, no API/CLI fallback.

## Final assets

- `public/lockin/penthouse-day-v8.png`: empty daytime room background, 1672×941; two equal 27-inch 16:9 monitors, one central stand per display.
- `public/lockin/penthouse-night-v8.png`: matching corrected dim nighttime background, 1672×941.
- `public/lockin/penthouse-foreground-v7.png`: full-canvas RGBA character/chair/foliage layer, 1672×941, actual transparent background.

Rejected v2–v6 assets are not shipped. Background plates intentionally contain no person or plant foliage; the independent foreground is composited by SVG masks. These are animation assets, not complete flattened screenshots.

## Visual research

Reviewed internal moodboard 02/03/08 for graphic identity, 04/07 for manga linework, and all eleven additional user-provided Persona references. The final direction uses reference 5's character inking, references 2/7's urban silhouettes/collage and reference 11's black-white value organization. Official sources consulted: [P4G](https://persona.atlus.com/p4g/), [P5R](https://persona.atlus.com/p5r/) and [P5R protagonist illustration](https://persona.atlus.com/p5r/resources/img/p5r/chara1_costume2_f44dcfe012ae7b8b2241c093a5df2ef8.png). Speaker form was checked against [Genelec 8030C](https://www.genelec.com/8030c); all speaker branding is removed.

These are our visual interpretations: economical Japanese manga inking, carefully shaped hair and folds, deliberate hard shadow wedges, city silhouette collage, controlled halftone and angular perspective. The room has an oblique shoulder-height camera, a slightly tilted horizon and a high penthouse view over rooftops and distant traffic. The narrative is quiet, solitary daily effort. Exact symmetry is not the goal. The original adult character wears a black front-zip hoodie with hood down, faces the displays and shows no face or glasses. Two 27-inch monitors show dense IDE panes/code marks, not giant legible source text. No official character, logo or supplied reference image is shipped as product content.

## Runtime animation and atmosphere

`StudyScene.tsx`, `StudyLife.tsx`, `StudyAtmosphere.tsx` and `study-scene.css` compose native SVG/CSS/canvas layers in the same 1672×941 coordinate space, scaled together for responsive cover:
- independent breathing, periodic posture/head shifts, small typing and mouse motions; chair stays still;
- foliage sway; the rejected moving block train/car overlays have been removed entirely;
- slow whole-room framing and ambient illumination changes; night windows are detected in the actual illustration and their existing pixels fade independently, with a denser twinkling sky;
- manual clear/cloudy/overcast/drizzle/storm/snow/blizzard: uneven particle fields with depth-dependent size/speed, wind gusts, glass water beads/runs, drifting soft clouds and distant haze;
- exact glass-pane clipping keeps weather off the desk, monitors, person and mullions;
- `StudyDisplays.tsx` owns the v8 inner-screen quadrilaterals; screen glow, code updates and caret positions map from each screen's local coordinates and share its clip, with soft desk reflections;
- reduced motion stops animation; hidden pages pause CSS motion and cancel the canvas frame loop.

The canvas caps painting at 30 fps on a fixed-size buffer, with at most 600 falling rain strokes and 95 near-glass beads. It does not update React on each frame or use WebGL/an animation framework. The scene is memoized independently of the timer. The browser's local clock chooses day from 07:00 to 18:59 and night otherwise, refreshing every 30 seconds and on focus/visibility return. White daytime sky and black nighttime sky are separate plates; the room and foreground are also dimmer at night. Weather starts clear per entry and is manually controlled. It is simulated, not real location weather, and stored only in component state. Focus timing/history remain in SQLite. “结束本轮” saves/stops the current round while staying in the room; “再开一轮” starts a new record, and explicit exit restores the planner.

FIND YOUR FLOW directly expands independent focus/rest minute settings, search, date range and history at the bottom of DESIGN, matching the page-level treatment of CANCELLATION LOG. The space can pause focus for a timed break and manually continue the same task. Only destructive record removal uses a confirmation dialog.

## Prompt set

### v8 monitor repair — daytime

Use case: precise-object-edit. Edit ONLY THE MONITORS and their supports in this exact clean manga penthouse background. The LEFT monitor is wrong: too long / ultrawide and has TWO separate pedestals. Replace it with ONE normal 27-inch 16:9 LANDSCAPE display, the SAME physical screen size and matching model as the right display, both modest identical thin bezels, same plausible perspective on this sloping desktop. Exactly TWO monitors total and exactly TWO stands TOTAL: one central neck and ONE single base per monitor. NOT three monitors, NOT joined display, NOT ultrawide. Make the left display narrower: approximately top-left(475,330),top-right(910,420),bottom-right(880,650),bottom-left(440,550) in the original1672x941 canvas. Match its visible screen aspect to the right screen with natural perspective; right screen may be adjusted slightly only to match equal27-inch16:9 dimensions. Each screen still has busy dark IDEs, many small indistinct code token lines, file trees, split panes and terminals, no readable giant code. Remove the extra left stand and fill desk naturally. Keep everything ELSE pixel-aligned and unchanged: camera/Dutch tilt, city skyline/windows/buildings, sky WHITE, floor/window mullions, room/speaker/lamp/book/keyboard/mouse positions, empty center, no person/chair/foliage, original precise Japanese manga cel ink lines/halftone, black/white/restrained yellow palette. NO realism, no logos, no new text. Output same full1672x941 wide canvas. This is one day background plate for an already animated scene; registration is critical.

### v8 monitor repair — nighttime

Use case: precise-object-edit. Image1 is the NIGHT animation background that must remain registered; image2 is the corrected DAY background showing the required monitors. Change ONLY BOTH MONITORS AND THEIR STANDS of image1 to exactly match image2's new monitor geometry and IDE screens: TWO identical normal 27-inch16:9 landscape displays, same physical size, each ONE central pedestal and ONE base, exactlyTWO stands TOTAL. Remove the extra third pedestal and the ultrawide malformed left screen. Copy the corrected geometry/angles/placement of the screens from image2 exactly, preserve dense tiny code lines/panes/filetrees/terminal. Match existing dim nighttime room lighting. Do NOT copy day sky/interior brightness fromimage2. Preserve everything outside monitors/supports of image1 exactly: BLACK night sky, original city skyline and all city/window/mullion positions, lit residential windows far below, desk, keyboard,mouse,book,speakers,lamp, floor, unchanged camera/Dutch tilt, original Japanese manga cel ink and halftone black/white/yellow style. No people/chair/foliage, no weather/stars/traffic, no logos/newtext, no realism. Same1672x941 fullcanvas. Animation plate geometry alignment is critical.

### Final penthouse composition

Use case: illustration-story.
Redesign image1's original study scene with the final camera/composition brief below. Images2/3/4 are Persona STYLE references only: refined Japanese manga character inking, angular cel-shadow design, bold ink/white urban cutout compositions, high contrast and halftone. Do not copy their characters, text, logos or costumes. Keep original artwork.

PERSONA-LIKE MANGA PENTHOUSE STUDY, panoramic16:9. Strong art-directed Japanese JRPG manga key-art drawing, dynamic diagonal perspective, ink shadow shapes and sophisticated thin-to-thick linework. No photorealism, 3D materials or generic realistic office. Not geometric clipart either. Restrained yellow/black/paper-white palette. Crisp cel fills and a little halftone in shadows. Graphic black-white-yellow cuts and small ring/star shapes ONLY at outer corners. Sky stays WHITE. Refined character linework is crucial.

NEW CAMERA: no rigid symmetrical straight-on catalog staging. Camera behind and slightly ABOVE the man's left shoulder, offset about15degrees, with a subtle 4degree Dutch tilt and exaggerated manga perspective. Desk runs diagonally through the frame, both monitors angled in space. The character's head/upper back still anchors the exact HORIZONTAL CENTER (x50%) of the full canvas. He is seen only from behind, NO FACE, no cheek/eye profile, no glasses. His posture has personality: relaxed forward lean while typing, one shoulder slightly lower, asymmetrical elbows, slender long anime arms, slight tilt of head toward his main screen. Stylish black messy hair. BLACK FRONT-ZIP HOODIE jacket, hood DOWN draped behind neck, not worn. All-black back with deliberate charcoal cel folds, not a suit, not coat. No front zipper seen from rear. Slim ADULT anime man with strong elegant silhouette, not generic realistic muscular adult. Simple low chair, no mesh texture.

PENTHOUSE: a high-floor corner apartment/studio far above the surrounding city. Floor-to-ceiling panoramic glazing with tall elegant dark mullions. Through it we look DOWN over distant rooftops and many layered smaller towers; visibly see roof planes below, streets and a thin elevated rail winding FAR BELOW us. Broad WHITE sky and distant horizon above. No giant railway at the window's eye level, no close neighbors at desk height. Convey altitude and airy metropolitan scale, a spectacular high-floor urban retreat. City drawn with Persona-like black/white silhouette collages, graphic window grids and restrained yellow signs, manga perspective rather than photoreal architecture. Large white sky remains upper third.

Desk: TWO clearly separated 27-inch 16:9 monitors one left/right of character, dark IDE layouts with DENSE tiny code-token-like lines and multiple panes. Content should look like a busy code editor at a glance, NOT readable giant source text and NOT five abstract big bars. File tree, tabs, split editor and integrated terminal as many small carefully drawn yellow/gray/white marks. NO legible code needed. All manga-stylized. EXACTLY TWO speakers outside displays, recognizable Genelec8000 cabinet silhouette: rounded pebble shape, concave upper tweeter waveguide, lower large woofer, tiny indicator and Iso-Pod feet, but ABSOLUTELY NO logo, labels or words on speakers. Keyboard and mouse under active hands, slim plain notebook at one side. A simple lamp, a hanging vine at left edge and potted leaves at right, few tasteful props. No clutter and no bed.

The illustration must feel more composed, stylish and alive in its stance than an evenly symmetrical workstation photograph. Prioritize dynamic perspective and posture, clear penthouse altitude, centered character, dense IDE panels, and sophisticated Persona manga drawing. Sparse yellow accent only, no colored sky. No UI, speech bubbles, readable signs, brand marks or existing Persona characters. Original scene ready for layered lightweight animation.

### Transparent animated foreground

Use case: background-extraction. Extract foreground animation sprites from the supplied ORIGINAL penthouse manga illustration, preserve exact original drawing and full1672x941 canvas. TRANSPARENT RGBA background, no crop/recenter/resize.
Keep ONLY:
1) the entire seated man and entire chair, including head/hair, neck, black hoodie hood down, torso, both arms, both hands and chair arms/back/base. Preserve the exact diagonal rear-view pose and original pixel positions.
2) the complete hanging vine/foliage on the left edge, in the same original position;
3) ONLY right potted plant leaves and stems (not pot), in the same position.
Remove EVERYTHING ELSE to true transparency: room, city, sky, window mullions, lamp, desk, keyboards, mouse, monitors, all code, speakers, notebooks, pot, mug, floor and graphic borders. Transparent holes between leaves and limbs/chair. No opaque black or white background, no checker pattern baked in. Preserve fine original manga ink/white edges and yellow leaf shapes without halo. Keep full wide canvas including transparent sky above character, not cropped subject. This layer will be placed directly on the matching background and animated independently, so absolute original placement and proportions must stay unchanged.

### Clean daytime background

Use case: precise-object-edit. Create a CLEAN BACKGROUND ANIMATION PLATE of this exact original penthouse manga scene. REMOVE the ENTIRE MAN and ENTIRE CHAIR, both hands/arms/hair/hood/body and all chair parts. REMOVE all hanging vine leaves/stems at left and the potted plant LEAVES/STEMS at right, but KEEP the right black plant pot in place. Fill those removed areas with the natural room behind: uninterrupted desk surface/keyboard/mouse, floor and panorama/monitor surfaces visible behind the removed man. Do not place anyone or any chair in the empty center.
Preserve EXACTLY the existing camera, diagonal desk perspective, monitor positions/angles/sizes, speaker positions, window frames, city/rooftop perspective, lamp, notebook, mug, floor, graphic corner framing, white sky and all manga ink/halftone/cel style. Both monitor screens retain their busy dark IDE layouts with DENSE small code-like token marks, split panes, file trees and terminal areas, not readable giant text. Speakers remain UNBRANDED: no logos or labels. Keep railway tracks in the city but NO trains/vehicles on them, because moving trains will be separate app objects. No painted weather, no stars, no new props. This is a clean full-canvas background for compositing the original foreground sprites back on top. Preserve exact geometry and dimensions1672x941 wide16:9. Sky stays paper-WHITE and yellow remains small restrained accents.

### Clean nighttime background

Use case: lighting-weather. Make the NIGHT version of this exact CLEAN BACKGROUND PLATE. Preserve all original diagonal penthouse perspective, camera tilt, room geometry, empty center, furniture/monitor/speaker positions, city silhouette linework and manga cel/halftone style.
Sky becomes BLACK #11120f throughout all glazing. Many irregular apartment windows glow small paper-white and yellow rectangles, households lit across the city FAR BELOW. Interior walls, white desk/book pages/floor become dim dark charcoal/gray, significantly darker at night. Both busy dark code IDEs remain readable as many tiny code-like marks, not legible source. Monitor light is represented only by sharp pale cel edges, no photographic bloom. Yellow corner graphic shapes subdued. Speakers are unbranded with NO words/logos.
Important: the clean plate stays EMPTY of people, chairs, left hanging vine, right plant leaves or stems. Keep right empty plant pot. Those items are separate transparent sprites, do NOT add them. Railway tracks remain EMPTY, no train or traffic, no stars or weather painted into sky. No new objects or text. No realism, detailed material render, light gradients or blue/red colors. Preserve exact image dimensions1672x941 and geometry so the original independent foreground sprites align pixel-perfectly. Night is lighting only.
