# Changelog

## Unreleased

- Active Effects on every item, a runner's own included: the book text's effects and the runner's bonuses, skill bonuses too, flagged as ours. Replace updates our items in place and swaps only our effects; a re-import keeps effects a user added. Effect targets Eden's editor lacks are added to it.
- The compendiums hold everything: a Reference compendium per book, one journal per kind Eden has no type for (metatypes, implant grades, traditions, actions, mentor spirits and the rest), one page per entry.
- Karma: Eden's `karma` (now) and `karma_total` (earned in play). The full career ledger is kept in the actor's flags for a ledger tab later.
- NPC and critter gear, weapon and augmentation lines become the real items from their book's compendiums, keeping the stat block's own values; unmatched lines stay text, ties are reported.
- Vehicles and drones are Eden Vehicle actors: a per-book actor compendium, and a runner's own linked to it with their mods and weapons.
- A runner's gender, its SINs (with each SIN's gender in its description) and each SIN's lifestyles, Eden's lifestyle naming its SIN. An older file's one lifestyle goes under the first SIN.
- A runner's martial art styles and the techniques learned under them; a style keeps its genesisID on Replace, so techniques stay tied to it.

- Identity: Foundry picks every document's id; the module no longer computes ids or keeps them. Each imported entry carries `chummerID` (`<book>:<kind>:<id>`) and `chummerAliases` (its keys from earlier Chummer imports) in the module's flags, and both are in every compendium's index.
- Re-importing a book updates each entry in place, found by `chummerID` or an alias; new entries are added; nothing is deleted. A rules journal's pages keep their ids; a martial art style keeps its genesisID.
- Migration: an entry imported with 0.2.x (an id computed from its key, no `chummerID`) is found by that id on the next import, updated in place and given `chummerID`. The report counts them.
- A runner's or NPC's items link to their book compendium entries by `chummerID`, then alias, then type and name inside that one book (same kind, then same page, breaks a tie); a tie is not linked and the report lists the candidates.
- genesisID stays empty everywhere; a martial art style gets a random one, as Eden's create button does.
- Fitted mods and installed programs are linked to their host after Foundry has given the items their ids.

Needs Chummer's export with the effects, Defense Rating bonuses and monitor bonus (`schema/sr6-export.schema.json`, Chummer's current copy). An older file still imports.

- Book text effects. A book entry whose text Chummer read an effect from (a quality's +1 Agility, Defense Rating, a skill bonus) gets it as an Active Effect in its compendium, which applies when the entry is dropped on a runner. An effect the book ties to a condition comes in switched off, for the GM to switch on. A test the entry calls for, and an Edge-cost reduction, go in its description. A runner's own items carry none of these yet, so Chummer and Foundry show the same numbers until Chummer applies them too.
- Accessories are fitted. A runner's weapon, armor and electronics accessories become shadowrun6-eden mods fitted to their host, and a program bought into a cyberdeck is installed in it. A book's weapon accessories become mods, and their Attack Rating changes apply to the weapon they're fitted to. An accessory's bonuses stay its host's and are no longer added to the runner. An accessory on ware (a cyberlimb's) stays a gear item that says where it's fitted. The host lists its accessories.
- Matrix devices. Commlinks, cyberdecks, cyberterms, dataterms and rigger consoles get their device rating, their attribute array on the attributes Eden's persona reads, and their program slots. The first device of each kind is switched on.
- Worn armor counts toward Eden's Defense Rating.
- A runner's Defense Rating bonuses (dermal plating) and Built Tough's extra Physical boxes reach Eden.
- Weapons get their specialization from Chummer, as Eden's key. Complex forms get their test from Eden's own table when the name matches. Spells get multi-sense. Vehicles and drones get their ground, water or air type.
- Nanoware, geneware, transgenics and symbionts get Eden's own types, and drugs, toxins, BTLs, slap patches, ammunition, grenades, rockets, missiles, explosives, magical formulae, lodges and security gear get Eden's gear types.
- An item's source shows as Eden's book name and page, with Eden's "open in PDF" link, for the books Eden lists. Other books have the source in the description, as before.
- A runner's item links to its entry in the imported book compendium (Foundry's compendium source), when that book is in the world.
- A runner's programs come in as software, no longer as tools. Item notes go in the item's notes too. A contact's types go in its description.

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
