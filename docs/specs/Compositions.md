# Compositions

Compositions are the motion pieces inside a Ripple project.

For v1, the user mostly experiences one active renderable composition at a time, plus reusable composition files such as lower thirds, title cards, CTAs, captions, app-shot blocks, and nested modules. Future sequence-native work can add more visible structure, but the current interface should stay simple.

[Composition Screenshot: active composition row with thumbnail, metadata, and activity badge]

## Project Pane

The Compositions tab lives in the left [[Shell Layout|project pane]] beside [[Assets]].

Each row should show:

- A miniature preview sampled from the composition.
- Composition name.
- File or role label when useful.
- Duration, aspect ratio, or size when available.
- Active row state.
- Activity badges from [[Comments]] or [[Revisions]].

Rows should stay in stable order. Selecting a row should not jump it to the top.

## Selecting A Composition

Selecting a composition should update [[Preview]] and [[Timeline]] to that composition without broad app churn.

Expected behavior:

- The row becomes active.
- Preview swaps to the selected composition.
- Timeline loads the selected composition's model.
- The selected project record remembers the active composition.
- Composition switching should preserve layout panels and not open HyperFrames Studio.

If the new source needs a moment, keep prior data as a placeholder and make the handoff feel calm.

## New Composition

New Composition opens the [[Templates]] gallery for composition creation.

After creation:

- The new composition appears in the list.
- It becomes the active composition.
- Preview opens it immediately.
- `index.html` remains unchanged unless placement is a separate explicit action.

This distinction matters: creating a reusable motion block is not the same thing as adding it to the main sequence/timeline.

## Reusable Motion Blocks

Reusable composition files can behave like motion blocks: lower thirds, title cards, CTAs, captions, app shots, and nested modules.

Current v1 behavior should keep block creation simple and avoid pretending there is a full sequence editor when there is not one. When placement is exposed, it should be explicit:

| Action | Expected behavior |
| --- | --- |
| Create reusable block | Adds a reusable composition and selects it |
| Place block into Main | Adds an instance to the main timeline/sequence as a separate action |
| Edit block | Updates the reusable source or selected instance clearly |
| Remove placement | Removes the instance without deleting the reusable source unless the user asks |

Placement should have stable IDs, recoverable failures, and clear warnings when a reusable source is still used elsewhere.

## Activity Badges

Composition rows can show lightweight activity badges for review work.

| Badge meaning | User interpretation |
| --- | --- |
| Working | An agent is producing changes related to this composition |
| Ready | Proposed changes are ready to review |
| Needs attention | A proposal needs refresh or could not finish |
| Accepted/resolved | No persistent attention needed unless new activity appears |

Badges are notifications, not ownership. A project chat can discuss any composition. A comment-backed conversation belongs to its anchored composition.

See [[Active Conversations]].

## Underneath

Ripple can discover compositions from HyperFrames, validate paths, reconcile `hyperframes.json`, prune removed rows, and serve thumbnails through the same safe preview path used by the main player.

The renderer should not scan arbitrary project folders or trust absolute paths.

## What Good Looks Like

The user can quickly answer "what piece am I working on?" and switch without losing the flow. Compositions feel like motion scenes or reusable blocks, not HTML files.

## Test Coverage

- `src/main/lib/hyperframes/compositions.test.ts` - Discovers compositions from CLI/declaration facts and rejects missing or escaped composition paths.
- `src/main/lib/hyperframes/project-browser.test.ts` - Builds the project browser model with active composition and asset facts.
- `src/renderer/features/hyperframes/project-model.test.ts` - Sorts compositions by stable file path and marks active rows without reordering.
- `src/renderer/features/hyperframes/composition-activity-badges.test.ts` - Hides acknowledged working badges and prioritizes needs-attention states.
