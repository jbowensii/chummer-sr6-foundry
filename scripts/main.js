// Entry point: the import window is built at init; GMs get an "Import from Chummer" button in the Actors and Compendium sidebars.
import { createImportApp } from './foundry/app.js'
import { guardEdenItemHooks } from './foundry/eden-guard.js'
import { addIndexFields, registerEffectTargets } from './foundry/apply.js'
import { createIconsApp, loadIconIndex } from './foundry/icons.js'
import { MODULE_ID } from './lib/constants.js'
import { registerQuench } from './foundry/quench.js'

let ImportApp = null
let icons = null  // icons/index.json, loaded once at init; null = no icons
let iconsLoaded = null  // that load: the import window waits for it, so an import never starts without the index
const APP_ID = 'chummer-sr6-import'

async function openImporter() {
  await iconsLoaded
  const open = foundry.applications.instances.get(APP_ID)
  if (open) open.bringToFront()
  else new ImportApp().render({ force: true })
}

// Into the directory footer of the Actors tab (runners, NPCs) and the Compendium tab (book data); both open the same window.
function addButton(root, tab) {
  root = root instanceof HTMLElement ? root : document.getElementById(tab)
  if (!game.user?.isGM || !ImportApp || !root || root.querySelector('.sr6i-import-btn')) return
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'sr6i-import-btn'
  const icon = document.createElement('i')
  icon.className = 'fas fa-file-import'
  button.append(icon, ` ${game.i18n.localize('SR6I.Button')}`)
  button.addEventListener('click', ev => { ev.preventDefault(); openImporter() })
  let footer = root.querySelector('.directory-footer')
  if (!footer) { footer = document.createElement('div'); footer.className = 'directory-footer flexrow'; root.append(footer) }
  footer.append(button)
}

Hooks.once('init', () => {
  guardEdenItemHooks()  // Eden's item update hooks need an actor; a compendium entry has none (eden-guard.js)
  addIndexFields()  // chummerID and its aliases in every compendium's index (lib/chummer-id.js)
  iconsLoaded = loadIconIndex().then(i => { icons = i })
  ImportApp = createImportApp(() => icons)
  // restricted: GM only
  game.settings.registerMenu(MODULE_ID, 'applyIcons', { name: 'SR6I.Icons.Title', label: 'SR6I.Icons.Button',
    hint: 'SR6I.Icons.Hint', icon: 'fas fa-image', type: createIconsApp(() => icons), restricted: true })
})
Hooks.on('renderActorDirectory', (app, html) => addButton(html, 'actors'))
Hooks.on('renderCompendiumDirectory', (app, html) => addButton(html, 'compendium'))
Hooks.on('changeSidebarTab', app => { if (app.tabName === 'actors' || app.tabName === 'compendium') addButton(null, app.tabName) })
// after Eden's own ready, which rebuilds CONFIG.SR6 (the system's hooks are registered before a module's)
Hooks.once('ready', () => { registerEffectTargets(); addButton(null, 'actors'); addButton(null, 'compendium') })
// again at setup, in case the system set its Item class after our init (guardEdenItemHooks runs once)
Hooks.once('setup', () => guardEdenItemHooks())
Hooks.on('quenchReady', quench => registerQuench(quench))
