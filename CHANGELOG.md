# Changelog

## 0.11.0 (2026-10-21)

NPC spells, a caster's tradition and ammunition loads (Nova Prime Chummer app PRs #149 and #150):

- An NPC's spells and rituals come in as the same Eden spell and ritual items a player runner's do (the catalog's name, fields and description), with the printed text and Force (`Glow Ward (F6)`) added to the item's description. A spell the catalog lacks is a plain spell named as printed.
- A caster NPC gets its tradition and drain attribute on the sheet, the way a runner does, and a Tradition section in its notes. When two traditions tie, the notes list them all and the first is the one set. An NPC with no magic block gets nothing invented.
- Ammunition: a ranged weapon is loaded with one load only, and the rest of the rounds the NPC owns stay as the spare ammunition item (before, the weapon was filled and a whole load was added on top, three loads in all). A stack that is exactly one load leaves no spare item. A spare clip, speed loader or spare magazine arrives as plain gear, never a rollable weapon. The ammo item's description now says what it is. An ammunition type (gel, APDS) is added as a fitted item on the stack, and the weapon's description says it is loaded with it. A weapon whose stat block prints its own ammunition gets none added and still comes loaded.
- NPC weapons roll as before.

## 0.10.0 (2026-10-21)

Ammunition materials (Nova Prime Chummer app PR #101):

- An ammunition line can carry a material (Bestial Nature p. 36: copper and common metals ×2, silver ×5, gold ×10 the price). The item's description gets a "Material: silver (×5 the price): …" line with what it does against a critter's Allergy or Vulnerability (core rulebook pp. 225–229), since Eden has no material field. Exports without a material import as before.

## 0.9.0 (2026-10-20)

NPCs and critters can fight (Nova Prime Chummer app PR #96):

- An imported NPC or critter carries its stat block as Eden items: every weapon and natural attack is a rollable weapon (Eden's normal weapon roll from the sheet), plus its armor, gear, augmentations, powers and spells. Close-combat Attack Rating is stored without Strength, since Eden adds it, so the sheet shows the printed value.
- Weapons arrive loaded with regular rounds, plus a spare load as an ammunition item (Eden won't fire an empty weapon). A Force-formula damage value (`F/2P`) is worked out at the critter's Force.
- An attack Chummer can't make rollable (Cybercombat, an unreadable damage value) is kept as a note item with its printed line, never dropped.
- Items link to the catalog by exact name, else by a close guess (75% or better), else the standard item of their kind; each item records how it was matched and its score.
- The actor's notes get a **Corrections** section listing every guess, standard stand-in, added ammo and unlinked item, rebuilt on each import. The NPC's Spells line has its own label.
- Re-importing replaces the items in place. Older export files without the new item list import as before.

## 0.8.0 (2026-10-18)

Owner-approved effect work, 2026-10-18 (every one of the 3,123 effects of a full catalog now has an outcome; the coverage test pins it):

- Attack bonuses a weapon carries (a rocket's +Rating, a guncam's) are the weapon's dice pool modifier (`system.modes.dicePoolMod`), a switchable effect on the weapon (on its host for an accessory), never the runner's skill. A rated runner item's follows the rating. Keep switches and conditions.
- A wild die a weapon or accessory gives is the weapon's own `system.wild` override.
- Fire-mode Attack Rating is Eden's flat `system.modes.SA_ar_mod`, `BF_ar_mod`, `FA_ar_mod`; single shot has none, and the mode flags are never written (the old key corrupted them).
- A single Attack Rating value is every band of the host, skipping bands it doesn't have (when its bands are known); `x` removes a band (Eden's "-").
- Change values are numbers. Drain and fading resistance now go on `system.defensepool.drain.mod` and `fading.mod`.
- Unarmed: the actor's physical attack rating mod, a module trait for unarmed DV and one for Physical damage; Eden's Unarmed item reads them (a getter patch).
- Armor's transferred effects are suppressed while the armor is not worn (live on the toggle).
- Movement `a/b/c` goes on Eden's walking rate, sprint base and sprint multiplier (flight stays a line). Low-light vision is the token's light amplification vision mode.
- Spells, complex forms and critter powers: an **Apply to targets** button copies their effects for targets and others to the targeted tokens (net hits or Force asked for), and removes them when sustaining ends or the item is deleted. A GM's client does it for tokens the player doesn't own (the module now uses a socket; it needs a GM online, and checks the sender owns the item and targets or sees the actor). A spell that is not sustained is refused. The effects also go when the item's actor or token is deleted, and a GM's client sweeps effects whose item is gone at start-up.
- Martial arts styles and techniques carry their effects too. Effects with no Eden field are lines, as before (`derived:essence-hole`, `item:cargo`, `test:attr-<abbr>` with no skill, a `set` of a skill or attribute).
- Tests: `test/catalog-coverage.test.js` runs a full anonymized catalog (`test/fixtures/catalog-effects.json`, made by `tools/catalog-fixture.mjs`) through the real translate path; `test/eden-runtime.test.js` covers the getter patches and Apply to targets.

- Programs, critter and sprite powers (a being's too) now carry their catalog effects: Active Effects where Eden has a key, described lines otherwise. Ammo types and data structures have no Eden item, so their effects are described lines on their Reference page.
- A Matrix attribute bonus (`matrix:attack`, `sleaze`, `data-processing`, `firewall`) is an effect on the persona's `system.persona.used` (the numbers Eden's attack/defense rating and initiative read, and itself writes effects on), so it counts at once and on every toggle. Eden rebuilds that stored persona only when an access device is switched, so an import and a Replace now ask Eden to rebuild it once the items exist.
- A fitted mod's effect meant for others or for a target is a described line ("Others get: ..."), never a change on the host or your own vehicle. The same for a vehicle's mod.
- A Matrix effect on a weapon's or armor's accessory is a described line: Eden reads a device's attributes only on a Matrix access device, never on a weapon.

## 0.7.0

Goes with Nova Prime Chummer's export of owned vehicles, drones and critters (BUILDER Q12; `schema/sr6-export.schema.json` takes the purchase's `mount`, `diy`, `vehicle`, `npc` and `critter`). Replace your runners to get them.

- A runner's critters are Eden Critter actors in "<runner> critters": the stat block's attributes, skills and innate critter powers (no Karma), its companion qualities as quality items, its critterware and critter gear as its items, its class, taming and trained commands and special training in its notes (a count, or the named ones from a later Chummer). The token is linked and friendly. Eden's Critter has no owner field, so only the module's flags (`runner`, `id`) tie it to the runner. A critter is no longer a stray TOOLS item on the runner.
- A runner's drones run autonomous (their Pilot and autosofts); vehicles stay manual. A vehicle mod's always-on change to the vehicle's own numbers (handling, acceleration, speed interval, top speed, body, armor, pilot, sensor, seats) is an effect on the mod that shadowrun6-eden applies to the Vehicle actor; the printed numbers stay the base.
- A weapon on a vehicle or drone says the mount it sits in (and keeps its uid in the flags); a do-it-yourself mod says so.
- An autosoft is shadowrun6-eden's autosoft of its kind (Clearsight, Electronic Warfare, Evasion, Maneuver, Stealth, Targeting, by its name), which the Vehicle actor rolls with. On a runner too.
- The Vehicle actor's notes list the mods built in, mod slots shifted, seats taken out for cargo, and a design bought from Chummer's Designer; the seats are what is left.
- Re-importing (Replace) updates each vehicle, drone and critter in place by the runner and the purchase's uid: no duplicates. Add as new version still leaves them to the original.
- The import report gives a line once even when a vehicle's mod is both a runner item and a Vehicle actor's.
- New effect targets: Astral, Direct Spell and Indirect Spell defense tests (`test:defense-astral`, `test:defense-spell-direct`, `test:defense-spell-indirect`) go to Eden's own defense pools, Matrix Defense Rating (`derived:matrix-defense`) to its Matrix defense rating mod (Eden applies it to Matrix users only). A cyberlimb's own attribute (`limb-attr:<abbr>`) has no Eden field: a described line.
- Drain and fading resistance are now described lines, not an effect: Eden's template has no mod for those pools, so an added value would be glued to the pool as text ("5" + "2" = "52").
- A spell's or form's "On the target" effect is written disabled: Eden applies an item's own non-transferred effects to the item, so a live one would change the spell. Enable it on the target.
- A weapon accessory's attack rating bonus skips a band where its weapon's is 0 or "-" (Eden's own guard for that never fires in Foundry 14). A book accessory, whose weapon is not known, keeps every band.
- A runner's rated gear or focus: an effect of exactly the rating (`R`) is Eden's `@item.system.rating`, so it follows the rating if you change it on the sheet. Other values stay the number the importer worked out.

## 0.6.1

The app is now named Nova Prime Chummer: the module's title, the import window and button, the refusal messages and the README use the new name. The module id, folders, flags and settings are unchanged, so existing worlds keep working.

## 0.6.0

Goes with Chummer Anarchy 2.0 release 0.13.0 (its export with the third-round effect kinds and one catalog item per level;
`schema/sr6-export.schema.json` is its copy). Import your books again and Replace your runners to get them.

- One item per level (Chummer 0.13.0, owner decision 2026-10-11): a rated or leveled entry comes as one entry per level, each with `family` and `level` in its attrs and its rating in its values. No code change was needed: each level imports as its own item keyed by its own id, with its rating and its effects at that rating; a re-imported book adds the levels beside an older item of the rated parent and deletes nothing (test/levels.test.js).

The 0.5.1 work, unreleased, is in this release:

Needs Chummer's export with the third-round effect kinds (`schema/sr6-export.schema.json` is its copy). Import your books again and Replace your runners to get them.

- Every effect target Chummer's importer produces has a route: an Active Effect on the actor, a change on the host item, or a described line (`effectRoute`; the test lists none unknown).
- A fitted add-on's item effects change its host's own fields: damage, ammunition capacity (a belt feed pack's 1,000 rounds, as an override), a vehicle's handling, acceleration and speed interval on- and off-road (`R/-R`: a point moved between them per rating), top speed, body, armor, pilot, sensor, seats, a device's Attack, Sleaze, Data Processing and Firewall. An Attack Rating modifier limited to fire modes (shock pads: Semi-Auto and Burst Fire) goes on shadowrun6-eden's per-mode AR modifier.
- Hardened Armor goes on `traits.hardenedArmor`, which shadowrun6-eden's Defense Rating and damage resistance read. A bonus on Magic Resistance tests goes on the spell defense pools (direct and indirect).
- The described lines word the new kinds: a sense (`Low Light Vision.`), a skill's maximum, prices in percent (`+10% Armor prices`), the chase pool's Edge, a complex form's bonus, a native language.
- Values per level after the first (`R-1`, `R*2-2`: counted at the item's rating, never below 0) and the book's own value per rating (`R[1,1,2,2]`) are evaluated like `R`; a removed Attack Rating band (`x`) is left out of the host's bands and worded `— (removed)`; a raised maximum (`action-max:`) is a described line.

## 0.5.0

Needs Chummer's export with effect switches and links (`schema/sr6-export.schema.json` is its copy). Import your books again and Replace your runners to get the new effects.

- Effects that turn on some way (wireless, activated, sustained, a condition, a specialization) come in as switched-off Active Effects, named for what turns them on: "Wireless: Smartlink", "Conditional: Made-up Gloves (climbing)". Always-on effects stay switched on.
- An effect Chummer is unsure of is no longer an Active Effect, only a line in the description.
- A spell's or complex form's effect on its caster is a switched-off effect on the spell; its effect on the target is not given to the caster, for a GM to apply.
- More effects reach shadowrun6-eden: Essence, astral Defense Rating, initiative and Matrix initiative (score and dice), Physical, Stun and Overflow boxes, Lift/Carry, Matrix attributes (the device's Attack, Sleaze, Data Processing, Firewall), the defense test and the damage, Drain and toxin resistance pools, and a test type's skills (Social: Con and Influence; Physical: the skills on Body, Agility, Reaction and Strength; and so on).
- What shadowrun6-eden has no field for stays a line in the item's description: Edge rules, extra actions, movement, a Matrix monitor, an attribute maximum, a spell category's tests.
- An entry that grants another or works as another gets that entry's effects, when it is in the same import (any book in the file; a runner's own items).
- A runner's item no longer counts an effect twice: what Chummer's bonuses hold comes from the bonuses. The always-on monitor boxes stay in the actor's monitor modifier.
- A runner's notes show Chummer's numbers with the switched-off effects on in brackets: "Defense Rating 7 (9)".

## 0.4.2

- Re-importing books works with shadowrun6-eden 4.0.11: its item update hooks (`_checkPersonaChanges`, `_updatePanSheets`) read the item's actor, which a compendium entry doesn't have, and Foundry fills the fields that set them off from Eden's defaults on every full update, so 0.4.1's fix wasn't enough. The module now has those two skip an item with no actor; on an actor's item they run as Eden wrote them.

## 0.4.1

- Re-importing books no longer fails with "Cannot read properties of undefined (reading 'uuid')" or "(reading 'items')": a compendium entry no longer carries the on-actor play state shadowrun6-eden 4.0.11 reacts to when it changes (usedForPool, wireless on, Matrix condition monitor), which made Eden look for an actor a compendium item doesn't have.
- Quench: per-book counts include `moved`; the re-import check unlocks Weapons even when it fails, so the next check isn't refused a locked pack.

## 0.4.0

Import your books again after updating: the compendiums are new. Then Replace your runners so their items link to the new entries, and delete the old per-book compendiums and their folders yourself (the import never touches them).

- One compendium per type with every book merged into it, in the Compendium folder "Chummer SR6": Weapons, Armor, Cyberware, Bioware, Geneware & nanoware, Electronics, Matrix programs, Gear, Mods & accessories, Drugs & toxins, Vehicles & drones (items and actors), Qualities, Spells, Rituals, Adept powers, Complex forms, Echoes, Metamagics, Foci, Critter powers, Sprite powers, Martial arts (styles and techniques), Lifestyles, Contacts, NPCs, Critters, Spirits, Sprites, Rules and Reference. No more folder and compendium set per book.
- Inside each compendium, folders by Chummer's category (Holdouts, Heavy pistols; Eyeware, Cyberlimbs; Combat, Detection …), shared by every book. Never an "Other" or "General" folder: an entry without a useful category is filed by its own data (positive or negative, activation, duration, Professional Rating, Eden subtype …) or, failing that, by its book. Spirits go by their Eden spirit type (Air, Fire, Man …); critters by the section they are printed under, else Awakened or Mundane critters by their Magic. Every entry keeps its book and page.
- Re-import upserts by `chummerID`, then alias, across all the type compendiums: an entry keeps its id and always goes to its category's folder (a re-filed entry moves, even out of a folder the GM chose); a book not in the file is left alone. User effects, user art, a style's genesisID (its techniques remapped), a rules journal's pages and a locked compendium's lock are kept as before.
- An entry whose type changed moves to its new type compendium: created there from the old one, every link in the world (runners', NPCs' and world items' compendium source) re-pointed at it, and the old copy deleted only when it is the module's own (it has `chummerID`). The report lists each move.
- A GM compendium keeps its own compendiums, one per type, in "Chummer SR6 compendiums/<name> (<id>)".
- The import writes a type at a time in chunks of a hundred, with progress per chunk; the report has a line per compendium with each book's created and updated counts.
- A runner's and an NPC's items link to the type compendiums only: `chummerID`, then alias, then type and name, preferring the item's own type compendium, then its own book; ties are reported with each candidate's book. The 0.3 per-book compendiums (`world.sr6-<book>-<topic>`) are never read or written; Apply icons works on the new compendiums.
- A critter power the book files under a sprite category imports as an Eden sprite power.

## 0.3.2

- The import window's book and runner lists scroll inside the window, so the Import button stays on screen with many books; the window can be resized.

## 0.3.1

- Quench: the migration check uses an entry the sample book has (Glitter Cannon), and says so if the sample lacks it.

## 0.3.0

Needs Chummer 0.11.0's export (`schema/sr6-export.schema.json` is its copy); older files still import. Includes 0.2.0, which was never released on its own. Import your books again so the compendiums get the new kinds and flags, then Replace your runners.

- Active Effects on every item, a runner's own included: the book text's effects and the runner's bonuses, skill bonuses too, flagged as ours. Replace updates our items in place and swaps only our effects; a re-import keeps effects a user added. Effect targets Eden's editor lacks are added to it.
- The compendiums hold everything: a Reference compendium per book, one journal per kind Eden has no type for (metatypes, implant grades, traditions, actions, mentor spirits and the rest), one page per entry.
- Karma: Eden's `karma` (now) and `karma_total` (earned in play). The full career ledger is kept in the actor's flags for a ledger tab later.
- NPC and critter gear, weapon and augmentation lines become the real items from their book's compendiums, keeping the stat block's own values; unmatched lines stay text, ties are reported.
- Vehicles and drones are Eden Vehicle actors: a per-book actor compendium, and a runner's own linked to it with their mods and weapons.
- A runner's gender, its SINs (with each SIN's gender in its description) and each SIN's lifestyles, Eden's lifestyle naming its SIN. An older file's one lifestyle goes under the first SIN.
- A runner's martial art styles and the techniques learned under them; a style keeps its genesisID on Replace, so techniques stay tied to it.
- A placeholder SIN (Chummer's unnamed one for an older lifestyle) shows as "Unnamed SIN (placeholder)", with a note to name it in Chummer. A technique's prerequisites go in its description, a missing one marked.
- The catalog's flags reach Eden: a spell's opposed test and Essence threshold (`isOpposed`, `withEssence`), a metamagic's adepts/magicians and taken-again level (`adepts`, `mages`, `hasLevel`, `level`), and armor's Social (`social`). A runner's skill bonuses become the skill's modifier.
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
