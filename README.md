# Chummer SR6 Importer

A Foundry VTT module that imports runners, NPCs and book data exported from [Chummer Anarchy 2.0](https://github.com/jbowensii/chummer-anarchy2)'s Shadowrun 6 side into the Shadowrun 6th Edition (`shadowrun6-eden`) system.

Tested with shadowrun6-eden 4.0.9 on Foundry 13 and 14. A newer shadowrun6-eden gets a warning, not a block; other systems are refused.

## Install

Once 0.1.0 is published, go to Add-on Modules in Foundry, choose Install Module, and paste the manifest URL:

```
https://github.com/jbowensii/chummer-sr6-foundry/releases/latest/download/module.json
```

Then enable "Chummer SR6 Importer" in your shadowrun6-eden world.

## Export from Chummer

Use Chummer's Shadowrun 6 side (not the Anarchy side; each module refuses the other game's file):

- One runner or NPC: in its editor, choose **Export for Foundry**.
- Several runners: in the runner list, choose **Export for Foundry…** and tick the runners you want (or tick a campaign).
- NPCs, critters, spirits and sprites: on **NPCs & Critters**, choose **Export for Foundry…** in the header, or **Export for Foundry** on a row.
- Book data (GMs only): **Game data → Export book data for Foundry**, tick the books.
- A GM compendium: **Export for Foundry** on its Compendiums page.

You get a file ending in `.sr6foundry.json` (`runners-…`, `books-…` or `compendium-<ID>-…`). The format is "Chummer SR6 export v1"; `schema/sr6-export.schema.json` is a copy of Chummer's.

## Import into Foundry

1. As the GM, open the Actors sidebar (or the Compendium sidebar) and click **Import from Chummer** at the bottom (players don't see the button).
2. Choose the file. The module checks it before anything in your world changes; a file it can't use says why. A Chummer Anarchy 2.0 file is refused with a pointer to the Chummer Anarchy 2.0 Importer.
3. Untick anything you don't want, pick what to do with actors already in the world, and click **Import**.

Runners go in the Actors folder "Chummer SR6" as Player actors with linked tokens. The report at the end lists anything that was turned into notes.

The module writes raw inputs only (attribute bases, skill points, specializations, magic or resonance type, Edge, items with their fields) and lets shadowrun6-eden work out dice pools, condition monitors, initiative and essence itself. Augmentation bonuses go in as effects on their items, which shadowrun6-eden applies. Every skill shadowrun6-eden knows is written, at 0 when the runner doesn't have it.

### A runner that's already in the world

- **Replace** (the default when the file is newer or the same): the actor is updated in place. It keeps its id, folder, ownership, token settings, wounds, Edge spent, heat, reputation and other play state, items you added yourself, and a dated name if it was added as a new version. Its sheet data and the items that came from Chummer are rebuilt from the file; a skill dropped in Chummer goes to 0.
- **Add as new version**: a second actor named with the export date, for example "Mara (4 Oct 2026)". The old one is untouched.
- **Skip**: nothing changes. This is chosen for you when the file is older than the copy in your world.

"Apply to all" sets the same choice on every row.

## NPCs, critters, spirits and sprites

- Grunts become NPC actors (rating, attribute bases, skills from their dice pools), critters Critter actors (powers as items), spirits Spirit actors (Force and type) and sprites sprite actors (type and level). shadowrun6-eden derives the rest.
- From a runners file they go in the Actors folder "Chummer SR6 NPCs". Replace, Add as new version and Skip work as for runners; the window labels each NPC row with its kind and rating.
- The GM-only facts (kind, rating, the printed stat block, gear and weapon lines shadowrun6-eden can't hold, source and page) go in the actor's **notes**. The module never gives players ownership, so they can't open the sheet.
- Tokens are hostile and unlinked, so each copy on the map takes its own damage.

## Book data

In the Compendium sidebar, click **Import from Chummer**, choose the book-data file, untick any book you don't want, and click **Import**. Each book gets its own folder, "<book name> (<book id>)", inside the Compendium folder "Chummer SR6", with one compendium per topic the book has entries for: Qualities, Weapons, Armor, Augmentations, Electronics, Gear, Vehicles & drones, Spells, Rituals, Adept powers, Complex forms, Metamagics, Echoes, Critter powers, Lifestyles, Contacts, NPCs, Critters, Spirits, Sprites, and Rules (one journal per chapter, one page per rule). Without descriptions an entry says where to read it ("See MUS p.50").

- Priorities, metatypes, attributes, skills and life modules are not used by shadowrun6-eden (it has fixed skills and no metatype item); the report says how many were left out.
- A compendium is never created empty: a book with nothing shadowrun6-eden uses gets no compendium and no folder, and the window says so.

### Importing a book again

A re-import replaces the entries that came from the file by id, so links to them keep working. Entries you made yourself, pages you added to a rules journal, items you added to a pack actor and images you picked are kept. Entries missing from the file are never deleted. A locked compendium is unlocked for the write and locked again after.

## GM compendiums

A compendium a GM made in Chummer imports like a book, into its own folder "<compendium name> (<id>)" inside the Compendium folder **"Chummer SR6 compendiums"**, with its compendiums labelled "(House)", e.g. "Weapons — STREET (House)". Its NPCs go in their kind's compendium, with portrait and token.

## Art

- A runner or NPC exported with a portrait gets it as its image; one with its own token image gets that on its token, otherwise the token shows the portrait. Images are uploaded into the world.
- A picture you pick in Foundry is never replaced, not by Replace, not by importing a book again and not by Apply icons: only empty images, Foundry's and shadowrun6-eden's stock images, the module's own icons and portraits and tokens imported from Chummer are.
- Items get an icon by category and sub-kind (weapon type, augmentation, electronics, vehicle or drone size, spell category, quality positive or negative, and so on). The defaults are the Chummer Anarchy 2.0 Importer's art for now; specific SR6 art by name comes in later updates.
- **Apply icons** (Game Settings → Configure Settings → Chummer SR6 Importer, GM only) re-applies the icons to imported items in the world, on actors and in the Chummer SR6 compendiums. Portraits and tokens are never touched.

## Not imported yet, or imported differently

- Vehicles and drones are items on the runner and in "Vehicles & drones", not Vehicle actors.
- An NPC's gear and weapon lines go in its notes as text.
- A skill, specialization, weapon category, spirit or sprite type shadowrun6-eden doesn't know imports as a generic one, with a report line and a note.
- A cyberdeck's or commlink's array and programs are kept as text.

## Sharing

For your own Foundry only. Don’t share the export file. A book-data file with descriptions holds text from books you own; share it only with people who own them.

## Tests

`npm install && npm test` runs the unit tests (Vitest).

### Tests in Foundry

1. Install and enable [Quench](https://github.com/Ethaks/FVTT-Quench) in a shadowrun6-eden 4.0.9 world (Foundry 13 and 14) alongside this module.
2. Open the Quench test runner, tick the "Chummer SR6 Importer" batches and run them.

The batches import the made-up samples in `samples/` (no book text) into a throwaway Actors folder "Chummer SR6 Importer tests" and compendiums named `sr6test-…`, and delete what they made when they finish.

## License

MIT, see [LICENSE](LICENSE). The module copies no shadowrun6-eden code, text or data; it only names its data keys.
