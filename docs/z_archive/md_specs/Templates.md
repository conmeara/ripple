# Templates

Templates are creative starting points for motion work.

A user should see templates as a gallery of useful motion pieces, not as code examples, packages, or scaffolds. Templates help the user start with a title card, lower third, social clip, brand promo, explainer, data story, product showcase, transition, or blank canvas.

[Templates Screenshot: gallery with Blank first, category filters, posters, and hover motion preview]

## Where Templates Appear

Templates appear in two places:

- [[Project Entry]] when creating a new project.
- [[Compositions]] when creating a new composition inside an existing project.

The user should not need to understand the difference between "project template" and "composition template." Ripple can filter the same catalog by target behind the scenes.

## Template Card

A card should show enough to make a fast creative choice:

- Poster or fallback thumbnail.
- Template name.
- Short description.
- Category.
- Duration.
- Aspect ratio.
- Selected state.
- Hover/focus motion preview when available.

Blank should always be easy to find and should remain the safest default.

## Gallery Behavior

| Interaction | Expected behavior |
| --- | --- |
| Select a card | Updates the selected template, does not create immediately |
| Hover/focus a card | Plays local motion preview when available |
| Filter by category | Narrows the gallery without losing selected state |
| Create Project | Copies template into a new local project |
| New Composition | Creates a reusable composition and selects it |

The gallery should stay fast. If motion previews are loading, poster images should remain useful. Reduced-motion users should not be forced into autoplay motion.

## Creating From A Template

When the user creates a project from a template, Ripple should copy the template source, assets, metadata, local runtime pieces, and preview data into the project safely.

When the user creates a new composition from a template, Ripple should create the composition file under `compositions/`, update HyperFrames metadata, refresh the project browser, select the new composition, and open it in [[Preview]]. It should not silently place that reusable composition into `index.html` unless the user asked for placement.

## Local-First Rules

Template creation should not fetch scripts, images, fonts, or registry files during normal authoring or export. The selectable catalog should be app-owned and available offline.

If a template asset is missing or invalid, the card should fail gracefully and creation should explain what went wrong.

## What Good Looks Like

The user can start from taste and intent: "I need a lower third" or "I need a product intro." Ripple turns that choice into a real local HyperFrames project or composition without exposing the catalog machinery.

## Test Coverage

- `src/main/lib/hyperframes/templates/catalog.test.ts` - Loads the offline template bundle, keeps Blank first, filters by target, and rejects removed generic starter ids.
- `src/main/lib/hyperframes/templates/installer.test.ts` - Creates reusable composition templates without patching `index.html` and handles repeat collisions.
- `src/renderer/features/templates/template-hover-preview.test.ts` - Ensures selectable templates have posters, preview videos, hover/focus hooks, and current Ripple mark usage.
- `test/e2e/template-review.e2e.ts` - Creates from a bundled template, toggles panes, and records a frame comment in the app.
