# Changelog

## 0.2.0

- Reads everything Chummer 0.9.5 exports for SR6 (`schema/sr6-export.schema.json` is Chummer's current copy): book data now has Matrix programs, martial art styles, martial art techniques and traditions.
- Each of them gets its own compendium per book, as the other topics do, and only when the book has some: Programs (shadowrun6-eden software items, typed Hacking, Basic and so on, with price and availability), Martial arts (Eden martial art styles with their categories ticked), Martial art techniques (a style's signature technique is tied to its style, so both show together on a runner's sheet) and Traditions (journals: shadowrun6-eden has no tradition item).
- Text shadowrun6-eden has no field for goes in the description: a quality's karma, as a range when the book prints several; a vehicle mod's slots; a critter power the book lists as a weakness.
- Default icons for programs and martial arts, from the existing set.
- In-Foundry tests: the book batch checks the new compendiums, and that a style and its technique dropped on a runner stay linked.

## 0.1.2

- No more duplicate Unarmed items in shadowrun6-eden 4.0.11. Eden adds its Unarmed item to every new runner without waiting, once for each connected browser, so a runner could end up with two (seen after Replace). After an import, a Replace, an Add as new version or a book import, the importer now keeps one Eden Unarmed item (the oldest) and removes the extras. It never touches your own items or the imported ones.
- Replace still writes the actor once, then adds the new items and removes the old ones in one step each.

## 0.1.1

- Tested in Foundry 14 (14.368) with shadowrun6-eden 4.0.11; the "newer shadowrun6-eden" warning now starts after 4.0.11.
- Initiative-dice bonuses from augmentations and adept powers apply in Eden 4.0.11: they add to the dice Eden rolls for initiative. The In-Foundry test now checks those rolled dice (it was reading the base dice, which a bonus never changes).
- shadowrun6-eden's own Unarmed item, which it adds to every new runner, is left alone: Replace never deletes it or adds a second one, and the In-Foundry tests no longer count it as an imported item.

## 0.1.0

- First release: imports Chummer SR6 export v1 files (Chummer's Shadowrun 6 side) into shadowrun6-eden 4.x on Foundry 13 and 14 (tested with shadowrun6-eden 4.0.9; a newer version warns, another system is refused).
- A file is checked before anything in the world changes; a Chummer Anarchy 2.0 file, a newer format version or a damaged file is refused with the reason.
- Runners become Player actors in the Actors folder "Chummer SR6": attribute bases, skill points and specializations, magic or resonance type, Edge, and their items (weapons, armor, augmentations with their bonuses as item effects, electronics, gear, vehicles and drones, spells, rituals, adept powers, complex forms, metamagics, echoes, qualities, contacts, lifestyles, SINs, knowledge and language skills). shadowrun6-eden derives pools, monitors, initiative and essence.
- NPCs, critters, spirits and sprites become NPC, Critter, Spirit and sprite actors in "Chummer SR6 NPCs", with the GM-only facts in their notes and hostile, unlinked tokens.
- Replace, Add as new version and Skip for actors already in the world; Replace keeps play state, ownership, your own items and art you picked.
- Book data and GM compendiums become world compendiums per book and topic in "Chummer SR6" and "Chummer SR6 compendiums" (House); never an empty compendium; re-import replaces by id and keeps your own entries, pages and art.
- Separate portrait and token images; default icons per item category (from the Chummer Anarchy 2.0 Importer's set) and an "Apply icons" settings menu.
- Unit tests (Vitest) and In-Foundry tests (Quench).
