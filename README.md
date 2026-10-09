# Chummer SR6 Importer

A Foundry VTT module that imports runners, NPCs and book data exported from [Chummer Anarchy 2.0](https://github.com/jbowensii/chummer-anarchy2)'s Shadowrun 6 side into the Shadowrun 6th Edition (`shadowrun6-eden`) system.

Tested with shadowrun6-eden 4.0.11 on Foundry 14.368. A newer shadowrun6-eden gets a warning, not a block; other systems are refused.

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

The module writes raw inputs only (attribute bases, skill points, specializations, magic or resonance type, Edge, items with their fields) and lets shadowrun6-eden work out dice pools, condition monitors, initiative and essence itself. Augmentation bonuses (attributes, Edge, initiative dice, Defense Rating) go in as effects on their items, which shadowrun6-eden applies; an accessory's bonuses are its host's, never the runner's. Built Tough's extra Physical boxes go in as the monitor's modifier. Worn armor counts toward the Defense Rating. A commlink's or cyberdeck's device rating, attribute array and program slots go in Eden's matrix fields, and the first device of each kind is switched on. Weapon, armor and electronics accessories are shadowrun6-eden mods fitted to their host, and a program bought into a deck is installed in it. A runner's items link to their entries in the imported book compendiums (Foundry's compendium source) when those books are in the world. Every skill shadowrun6-eden knows is written, at 0 when the runner doesn't have it.

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

In the Compendium sidebar, click **Import from Chummer**, choose the book-data file, untick any book you don't want, and click **Import**. Each book gets its own folder, "<book name> (<book id>)", inside the Compendium folder "Chummer SR6", with one compendium per topic the book has entries for: Qualities, Weapons, Armor, Augmentations, Electronics, Programs, Gear, Vehicles & drones, Spells, Rituals, Adept powers, Complex forms, Metamagics, Echoes, Martial arts, Martial art techniques, Critter powers, Lifestyles, Contacts, NPCs, Critters, Spirits, Sprites, Rules (one journal per chapter, one page per rule) and Reference (one journal per kind Eden has no type for). Without descriptions an entry says where to read it ("See MUS p.50").

- Matrix programs become shadowrun6-eden software items (Hacking, Basic and the other Eden software types; an unknown type is Basic, with a report line). Martial art styles and techniques become Eden's martial art style and technique items; a style's categories are its Eden checkboxes, and its signature technique is tied to it, so the two show together when both are dropped on a runner. shadowrun6-eden lists a technique on a runner only under its style, so a technique that is no style's signature does not show there; add it with the + on the style instead.
- Every kind shadowrun6-eden has no item or actor for (metatypes, implant grades, traditions, priorities, attributes, skills, life modules, actions, mentor spirits, gear packs, ammunition types, optional rules and the rest) goes in the book's **Reference** compendium: one journal per kind, one page per entry with its printed stats and lines, its text, source and page. (A world that imported traditions as one journal each keeps those; nothing is deleted.)
- Text shadowrun6-eden has no field for goes in the item's description: a quality's karma (a range when the book prints several), a vehicle mod's slots, a critter power the book lists as a weakness.
- A compendium is never created empty: a book with nothing shadowrun6-eden uses gets no compendium and no folder, and the window says so.

### Importing a book again

Foundry gives every document its own id; the module never sets one. Each entry it imports carries Chummer's key for it in the module's flags: `chummerID` (`<book>:<kind>:<id>`, for example `MUS:weapons:mus.pocket-zapper`) and `chummerAliases` (the keys it had in earlier Chummer imports, when Chummer renamed or re-filed it). Both are in every compendium's index.

A re-import finds each entry by its `chummerID`, then by an alias, and updates it in place: it keeps its id, so links to it keep working. Anything new is added. Nothing is ever deleted: entries missing from the file, entries you made yourself, pages you added to a rules journal and items you added to a pack actor stay, and so do images you picked, the entry's folder and its ownership. A rules journal's imported pages keep their ids too. A martial art style keeps the genesisID it already has, so techniques on runners stay tied to it. A locked compendium is unlocked for the write and locked again after.

**Worlds that imported books with 0.2.x or earlier.** Those versions gave each entry an id computed from its key. A re-import with this version finds such an entry by that id, updates it in place and writes `chummerID` onto it, so nothing is duplicated and links keep working. The import report counts them as migrated. After that, the entry is found by `chummerID`.

### A runner's items and the book compendiums

When a runner or NPC is imported, each of its items from a book is linked to its entry in that book's compendiums in this world (Foundry's compendium source, shown on the item): by `chummerID`, then by an alias, then by the same item type and name inside that one book's compendiums. Several entries with that name: the one of the same kind, then the one on the same page. Still more than one: no link, and the import report lists them. The module never matches by name across all compendiums.

`genesisID` (shadowrun6-eden's own key for its translations and its Import Data) stays empty, except on martial art styles, which get a random one as Eden's own "create" button gives them, so Eden can tie techniques to their style.

## GM compendiums

A compendium a GM made in Chummer imports like a book, into its own folder "<compendium name> (<id>)" inside the Compendium folder **"Chummer SR6 compendiums"**, with its compendiums labelled "(House)", e.g. "Weapons — STREET (House)". Its NPCs go in their kind's compendium, with portrait and token.

## Art

- A runner or NPC exported with a portrait gets it as its image; one with its own token image gets that on its token, otherwise the token shows the portrait. Images are uploaded into the world.
- A picture you pick in Foundry is never replaced, not by Replace, not by importing a book again and not by Apply icons: only empty images, Foundry's and shadowrun6-eden's stock images, the module's own icons and portraits and tokens imported from Chummer are.
- Items get an icon by category and sub-kind (weapon type, augmentation, electronics, vehicle or drone size, spell category, quality positive or negative, and so on). The defaults are the Chummer Anarchy 2.0 Importer's art for now; specific SR6 art by name comes in later updates.
- **Apply icons** (Game Settings → Configure Settings → Chummer SR6 Importer, GM only) re-applies the icons to imported items in the world, on actors and in the Chummer SR6 compendiums. Portraits and tokens are never touched.

## Not imported yet, or imported differently

- Vehicles and drones are items on the runner and in "Vehicles & drones", not Vehicle actors.
- An NPC's or critter's gear, weapon and augmentation lines become the real items from its book (in a book import, the book's own entries; for a runners file's NPC, that book's compendiums in this world): matched by name inside that book, the stat block's own values (DV, AR, modes, ammunition, rating) kept over the entry's, its "w/" accessories with it. A line that matches nothing stays text in the notes; several matches leave it as text and the report lists them.
- A skill, specialization, weapon category, spirit or sprite type shadowrun6-eden doesn't know imports as a generic one, with a report line and a note.
- A device array printed another way than a row of numbers is kept as text.
- Effects Chummer read from a book's text are on the compendium entries only, not yet on a runner's own items (Chummer doesn't apply them yet). An item's source shows as Eden's book only for the books Eden lists; `genesisID` stays empty.

## Sharing

For your own Foundry only. Don’t share the export file. A book-data file with descriptions holds text from books you own; share it only with people who own them.

## Tests

`npm install && npm test` runs the unit tests (Vitest).

### Tests in Foundry

1. Install and enable [Quench](https://github.com/Ethaks/FVTT-Quench) in a shadowrun6-eden 4.0.11 world (Foundry 13 and 14) alongside this module.
2. Open the Quench test runner, tick the "Chummer SR6 Importer" batches and run them.

The batches import the made-up samples in `samples/` (no book text) into a throwaway Actors folder "Chummer SR6 Importer tests" and compendiums named `sr6test-…`, and delete what they made when they finish.

## License

MIT, see [LICENSE](LICENSE). The module copies no shadowrun6-eden code, text or data; it only names its data keys.
