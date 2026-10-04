# Chummer SR6 Importer

A Foundry VTT module that imports runners, NPCs and book data exported from [Chummer Anarchy 2.0](https://github.com/jbowensii/chummer-anarchy2)'s Shadowrun 6 side into the Shadowrun 6th Edition (`shadowrun6-eden`) system.

Tested with shadowrun6-eden 4.0.9 on Foundry 13 and 14. A newer shadowrun6-eden gets a warning, not a block; other systems are refused.

Work in progress: the first release (0.1.0) is not out yet.

## Install

In Foundry, go to Add-on Modules, choose Install Module, and paste the manifest URL:

```
https://github.com/jbowensii/chummer-sr6-foundry/releases/latest/download/module.json
```

Then enable "Chummer SR6 Importer" in your shadowrun6-eden world.

## The file

Chummer writes one format, "Chummer SR6 export v1" (`schema/sr6-export.schema.json`, a copy of Chummer's). The module checks a file before anything in your world changes, and refuses a Chummer Anarchy 2.0 file with a pointer to the Chummer Anarchy 2.0 Importer.

For your own Foundry only: a book data file holds text from books you own. Don't share it.

## How it writes to shadowrun6-eden

It writes raw inputs only (attribute bases, skill points, specializations, magic or resonance type, items with their fields) and lets shadowrun6-eden work out dice pools, condition monitors, initiative and essence itself. It names shadowrun6-eden's data keys but copies none of its code, text or data.

## Tests

`npm test` (Vitest).

## License

MIT, see [LICENSE](LICENSE).
