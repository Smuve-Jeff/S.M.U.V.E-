const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const refreshPath = path.join(root, 'src/app/hub/tha-spot-genre-refresh-catalog.ts');
const premiumPath = path.join(root, 'src/app/hub/tha-spot-premium-catalog.ts');
const feedPath = path.join(root, 'src/assets/data/tha-spot-feed.json');
const refreshText = fs.readFileSync(refreshPath, 'utf8');
const sf = ts.createSourceFile(refreshPath, refreshText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let rowsNode;
function findRows(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'ROWS') rowsNode = node;
  ts.forEachChild(node, findRows);
}
findRows(sf);
if (!rowsNode || !ts.isArrayLiteralExpression(rowsNode.initializer)) throw new Error('Cannot locate ROWS literal');
const oldRows = rowsNode.initializer.elements.map((el) => {
  const row = {};
  if (!ts.isObjectLiteralExpression(el)) return row;
  for (const p of el.properties) {
    if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
    if (ts.isStringLiteral(p.initializer)) row[p.name.text] = p.initializer.text;
    else if (ts.isNumericLiteral(p.initializer)) row[p.name.text] = Number(p.initializer.text);
  }
  return row;
});
const priorBySlug = new Map(oldRows.map((r) => [r.slug, r]));
const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
const existingNames = new Set((feed.games || []).map((g) => normalize(g.name)));
const existingUrls = new Set((feed.games || []).map((g) => normalizeUrl(g.url)));
const existingNamesAll = new Set(existingNames);
const existingUrlsAll = new Set(existingUrls);
function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function normalizeUrl(value) { return normalize(String(value || '').replace(/\/$/, '')); }
for (const curatedPath of [
  path.join(root, 'src/app/hub/tha-spot-curated-games.ts'),
  path.join(root, 'src/app/hub/tha-spot-crazygames-catalog.ts'),
]) {
  const curatedText = fs.readFileSync(curatedPath, 'utf8');
  const curatedFile = ts.createSourceFile(curatedPath, curatedText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  function collectCurated(node) {
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
        if (property.name.text === 'name' && ts.isStringLiteral(property.initializer)) existingNames.add(normalize(property.initializer.text));
        if (property.name.text === 'url' && ts.isStringLiteral(property.initializer)) existingUrls.add(normalizeUrl(property.initializer.text));
      }
    }
    ts.forEachChild(node, collectCurated);
  }
  collectCurated(curatedFile);
}

// Candidates were sourced from direct CrazyGames/Poki game pages whose page titles and descriptions describe browser gameplay.
const candidates = [
  ['Bullet Force','Shooting','https://www.crazygames.com/game/bullet-force-multiplayer'],['Fragen','Shooting','https://www.crazygames.com/game/fragen'],['BodyCamera Shooter','Shooting','https://www.crazygames.com/game/bodycamera-shooter'],['Chicken CS','Shooting','https://www.crazygames.com/game/chicken-cs'],['Mazean','Shooting','https://www.crazygames.com/game/mazean-com'],['Overtide.io','Shooting','https://www.crazygames.com/game/overtide-io'],['Forward Assault Remix','Shooting','https://www.crazygames.com/game/forward-assault'],['Special Ops: GO','Shooting','https://www.crazygames.com/game/special-ops-go'],['Pixel Warfare','Shooting','https://www.crazygames.com/game/pixel-warfare'],['StarBlast','Shooting','https://www.crazygames.com/game/starblastio'],['The Battleground','Shooting','https://www.crazygames.com/game/the-battleground'],['TDP4: Team Battle','Shooting','https://www.crazygames.com/game/tdp4-team-battle'],['Deadrise.io','Shooting','https://poki.com/en/g/deadrise-io'],['Repuls.io','Shooting','https://poki.com/en/g/repuls-io'],['Cryzen.io','Shooting','https://poki.com/en/g/cryzen-io'],['HEIST.IO','Shooting','https://poki.com/en/g/heist-io'],['Venge.io','Shooting','https://poki.com/en/g/venge-io'],['Blockheads','Shooting','https://poki.com/en/g/blockheads'],
  ['Basketball League','Sports','https://www.crazygames.com/game/basketball-league'],['Sports Minibattles','Sports','https://www.crazygames.com/game/sport-minibattles'],['Soccer Legends 2026','Sports','https://www.crazygames.com/game/soccer-legends-2021'],['Unmatched Basketball','Sports','https://www.crazygames.com/game/unmatched-basketball'],['Basket Battle','Sports','https://www.crazygames.com/game/basket-battle-zmg'],['Sports Hero','Sports','https://www.crazygames.com/game/sports-hero'],['Mini Golf Club','Sports','https://www.crazygames.com/game/mini-golf-club'],['Tennis Masters','Sports','https://www.crazygames.com/game/tennis-masters'],['Soccer Skills World Cup','Sports','https://poki.com/en/g/soccer-skills-world-cup'],['Football Legends','Sports','https://poki.com/en/g/football-legends'],['Soccer REAL','Sports','https://poki.com/en/g/soccer-real'],['Soccer League','Sports','https://poki.com/en/g/soccer-league'],['GoalHeads.io','Sports','https://poki.com/en/g/goalheads-io'],['Ragdoll Soccer','Sports','https://poki.com/en/g/ragdoll-soccer'],['Football Masters','Sports','https://poki.com/en/g/football-masters'],['Basketball REAL','Sports','https://poki.com/en/g/basketball-real'],['Ping Pong Go!','Sports','https://poki.com/en/g/ping-pong-go'],['Golfparty.io','Sports','https://poki.com/en/g/golfparty-io'],
  ['Racing: Online!','Racing','https://www.crazygames.com/game/racing-online-fph'],['Crazy Stunt Cars Multiplayer','Racing','https://www.crazygames.com/game/crazy-stunt-cars-multiplayer'],['Circuit Racing','Racing','https://www.crazygames.com/game/circuit-racing'],['Car Games: Car Racing Game','Racing','https://www.crazygames.com/game/car-games-car-racing-game'],['Racing Limits','Racing','https://www.crazygames.com/game/racing-limits'],['Crazy Grand Prix','Racing','https://www.crazygames.com/game/crazy-grand-prix'],['Modern Car Racing 2','Racing','https://www.crazygames.com/game/modern-car-racing-2'],['RCC City Racing','Racing','https://www.crazygames.com/game/rcc-city-racing'],['Street Racing: Open World','Racing','https://www.crazygames.com/game/street-racing-open-world'],['2 Player City Racing','Racing','https://poki.com/en/g/2-player-city-racing'],['MR RACER - Car Racing','Racing','https://poki.com/en/g/mr-racer-car-racing'],['Crazy Cars','Racing','https://poki.com/en/g/crazy-cars'],['MPH Online','Racing','https://poki.com/en/g/mph-online'],['Sky Race','Racing','https://poki.com/en/g/sky-race'],['Racing Rampage','Racing','https://poki.com/en/g/racing-rampage'],['Urban Racer','Racing','https://poki.com/en/g/urban-racer'],['Superbike Hero','Racing','https://poki.com/en/g/superbike-hero'],
  ['Wrestle Bros','Fighting','https://www.crazygames.com/game/wrestle-bros'],['Brawl Frenzy: Fight.io','Fighting','https://www.crazygames.com/game/brawl-frenzy-fight-io'],['Ragdoll Fight','Fighting','https://www.crazygames.com/game/ragdoll-fight'],['Funny Ragdoll Wrestlers','Fighting','https://www.crazygames.com/game/funny-ragdoll-wrestlers'],['Drunken Boxing','Fighting','https://www.crazygames.com/game/drunken-boxers'],['Stickman Kombat 2D','Fighting','https://www.crazygames.com/game/stickman-kombat-2d'],['Fight Arena Online','Fighting','https://www.crazygames.com/game/fight-arena-online'],['Puppet Fighter 2 Player','Fighting','https://www.crazygames.com/game/puppet-fighter-2-player'],['Electric Man','Fighting','https://www.crazygames.com/game/electric-man'],['Stick Epic Fighter','Fighting','https://www.crazygames.com/game/stick-epic-fighter'],['BrutalMania.io','Fighting','https://www.crazygames.com/game/brutalmania-io'],['Hobo','Fighting','https://www.crazygames.com/game/hobo'],['Crazy Office: Slap and Smash!','Fighting','https://www.crazygames.com/game/crazy-office-slap-and-smash'],['Karate Fighter','Fighting','https://poki.com/en/g/karate-fighter'],['Stick Fighter','Fighting','https://poki.com/en/g/stick-fighter'],['Stickman Dragon Fight','Fighting','https://poki.com/en/g/stickman-dragon-fight'],['Magic Battleground','Fighting','https://poki.com/en/g/magic-battleground'],['Iron Snout','Fighting','https://poki.com/en/g/iron-snout'],['Stickman Battle','Fighting','https://poki.com/en/g/stickman-battle'],['Thumb Fighter','Fighting','https://poki.com/en/g/thumb-fighter'],['Gladihoppers','Fighting','https://poki.com/en/g/gladihoppers'],
  ['Sword Masters','RPG','https://poki.com/en/g/sword-masters'],['Kingdom Heroes','Adventure','https://poki.com/en/g/kingdom-heroes'],['Apple Knight','RPG','https://poki.com/en/g/apple-knight'],['Dungeons & Blades','RPG','https://poki.com/en/g/dungeons-and-blades'],['Heroes League','RPG','https://poki.com/en/g/heroes-league'],['Skill Knight','RPG','https://poki.com/en/g/skill-knight'],['Firestone - Idle Clicker Online RPG','RPG','https://www.crazygames.com/game/firestone-idle-rpg'],['Fantasy Online 2','RPG','https://www.crazygames.com/game/fantasy-online-2'],['Waddle’s Quest','RPG','https://www.crazygames.com/game/waddle-s-quest'],['Gothic Story RPG','RPG','https://www.crazygames.com/game/gothic-story-rpg'],['EmberQuest.io','RPG','https://www.crazygames.com/game/emberquest-io'],['War Lands','RPG','https://www.crazygames.com/game/war-lands'],['OneBit Adventure','RPG','https://www.crazygames.com/game/onebit-adventure'],['Dark Odyssey','RPG','https://www.crazygames.com/game/dark-odyssey-lzc'],['Revenot','RPG','https://www.crazygames.com/game/revenot-roguelike-action-rpg'],['Swords & Souls','RPG','https://www.crazygames.com/game/swords-souls'],['Skillfite.io','RPG','https://www.crazygames.com/game/skillfite-io'],['Grow RPG','RPG','https://www.crazygames.com/game/grow-rpg'],
  ['Pixel Realms','Survival','https://poki.com/en/g/pixel-realms'],['Survival Island','Survival','https://poki.com/en/g/survival-island'],['Tribals.io','Survival','https://poki.com/en/g/tribals-io'],['Beardie Craft Survival','Survival','https://poki.com/en/g/beardie-craft-survival'],['Fantasy Sandbox','Survival','https://poki.com/en/g/fantasy-sandbox'],['Anicca','Adventure','https://www.crazygames.com/game/anicca'],['Aground','Survival','https://www.crazygames.com/game/aground'],['99 Nights in the Forest Online','Survival','https://www.crazygames.com/game/99-nights-online'],['Survev.io','Battle Royale','https://www.crazygames.com/game/survev'],['Frost Land - Snow Survival','Survival','https://www.crazygames.com/game/frost-land'],['WorldZ','Survival','https://www.crazygames.com/game/worldz'],['World Craft Dream Island','Survival','https://www.crazygames.com/game/world-craft-dream-island'],['CraftSlayer: Apocalypse','Survival','https://www.crazygames.com/game/craftslayer-apocalypse'],
  ['Hex Empire','Strategy','https://www.crazygames.com/game/hex-empire'],['Four Mini Kingdoms War','Strategy','https://www.crazygames.com/game/four-mini-kingdoms-war'],['World Wars 2','Strategy','https://www.crazygames.com/game/world-wars-2'],['Battle for Resources','Strategy','https://www.crazygames.com/game/battle-for-resources'],['Kingdom Rush','Strategy','https://www.crazygames.com/game/kingdom-rush'],['War Groups','Strategy','https://www.crazygames.com/game/war-groups'],['Kiomet','Strategy','https://www.crazygames.com/game/kiomet-com'],['Takeover','Strategy','https://www.crazygames.com/game/takeover'],['Age Of War','Strategy','https://www.crazygames.com/game/age-of-war'],['War of Sticks','Strategy','https://poki.com/en/g/war-of-sticks'],['Draft Wars','Strategy','https://poki.com/en/g/draft-wars'],['Like a King','Strategy','https://poki.com/en/g/like-a-king'],['King Rugni','Strategy','https://poki.com/en/g/king-rugni'],['MicroWars','Strategy','https://poki.com/en/g/microwars'],['Chess Online Multiplayer','Strategy','https://www.crazygames.com/game/chess-online-multiplayer-game'],['Desktop Tower Defense','Strategy','https://www.crazygames.com/game/desktop-tower-defense'],['Mancala Classic','Strategy','https://www.crazygames.com/game/mancala-classic'],
  ['The Unfair Platformer','Platformer','https://www.crazygames.com/game/the-unfair-platformer'],['Rotate','Platformer','https://www.crazygames.com/game/rotate'],['Opposite Day','Platformer','https://www.crazygames.com/game/opposite-day'],['Steve’s World','Adventure','https://www.crazygames.com/game/steve-s-world'],['Project Prismatic','Adventure','https://www.crazygames.com/game/project-prismatic'],['Glitch','Platformer','https://www.crazygames.com/game/glitch-mkf'],['Appel','Platformer','https://www.crazygames.com/game/appel'],['Red Ball 4','Platformer','https://poki.com/en/g/red-ball-4'],['Dan The Man','Action','https://poki.com/en/g/dan-the-man'],['Double Edged','Action','https://poki.com/en/g/double-edged'],['Temple of Boom','Action','https://poki.com/en/g/temple-of-boom'],['Jump Only','Platformer','https://poki.com/en/g/jump-only'],['Slime Laboratory','Platformer','https://poki.com/en/g/slime-laboratory'],['Level Devil','Platformer','https://poki.com/en/g/level-devil'],['Bugs.io','Action','https://poki.com/en/g/bugs-io'],['Monkey Tag IO','Action','https://poki.com/en/g/monkey-tag-io'],['Aquapark.io','Racing','https://poki.com/en/g/aquaparkio'],['Fortride: Open World','Racing','https://poki.com/en/g/fortride-open-world'],['PolyTrack','Racing','https://poki.com/en/g/polytrack'],['Disaster Arena','Action','https://poki.com/en/g/disaster-arena'],['Duo Survival 2','Co-op','https://poki.com/en/g/duo-survival-2'],['Duo Vikings','Co-op','https://poki.com/en/g/duo-vikings'],['Duo Vikings 3','Co-op','https://poki.com/en/g/duo-vikings-3'],['Squid Game Online','Battle Royale','https://www.crazygames.com/game/squid-game-online'],['Narrow.One','Shooting','https://poki.com/en/g/narrow-one'],['Downhill Chill','Sports','https://poki.com/en/g/downhill-chill'],['Blumgi Ball','Sports','https://poki.com/en/g/blumgi-ball'],['Soccer Skills Champions League','Sports','https://poki.com/en/g/soccer-skills-champions-league'],['World Cup Penalty','Sports','https://www.crazygames.com/game/world-cup-penalty'],['Zombie Rush','Shooting','https://poki.com/en/g/zombie-rush'],['Happy Wheels','Action','https://www.crazygames.com/game/happy-wheels'],['Duo','Co-op','https://www.crazygames.com/game/duo-kjn'],['Zoom-Be','Co-op','https://poki.com/en/g/zoom-be'],['Krew.io','Shooting','https://www.crazygames.com/game/krewio'],['A Grim Chase','Platformer','https://www.crazygames.com/game/a-grim-chase'],['We Become What We Behold','Action','https://www.crazygames.com/game/we-become-what-we-behold'],['NEON SURGE','Co-op','https://www.crazygames.com/game/neon-surge-wrr'],['Powerline Guardians','Co-op','https://www.crazygames.com/game/powerline-guardians'],['Blocky Tower Defense 2D','Strategy','https://www.crazygames.com/game/blocky-tower-defense-2d'],['Poor Bunny','Co-op','https://poki.com/en/g/poor-bunny'],['Max and Mink','Co-op','https://poki.com/en/g/max-and-mink'],['Rumble Rush','Action','https://poki.com/en/g/rumble-rush'],['Basketball Superstars','Sports','https://poki.com/en/g/basketball-superstars'],['Basketball Stars','Sports','https://poki.com/en/g/basketball-stars'],['Basket Champs','Sports','https://poki.com/en/g/basket-champs'],['Gladihoppers','Fighting','https://poki.com/en/g/gladihoppers'],['Survival Craft Adventure','Survival','https://www.crazygames.com/game/survival-craft-adventure'],['Raft Life','Survival','https://www.crazygames.com/game/raft-life'],['Underwater Survival: Deep Dive','Survival','https://www.crazygames.com/game/underwater-survival-deep-dive'],['Chicken CS','Shooting','https://www.crazygames.com/game/chicken-cs'],['Starblast.io','Shooting','https://www.crazygames.com/game/starblastio'],['Holey.io Battle Royale','Battle Royale','https://www.crazygames.com/game/holey-io-battle-royale'],['Gridpunk - 3v3 Battle Royale','Battle Royale','https://www.crazygames.com/game/gridpunk---3v3-battle-royale'],['Card Wars','Strategy','https://www.crazygames.com/game/card-wars'],['Captain Forever Remix','Action','https://www.crazygames.com/game/captain-forever-remix'],['Hobo','Fighting','https://www.crazygames.com/game/hobo'],['Gladihoppers','Fighting','https://www.crazygames.com/game/gladihoppers'],['Smash Karts','Racing','https://poki.com/en/g/smash-karts']
];
const byName = new Map();
for (const [name, genre, url] of candidates) {
  const key = normalize(name);
  if (existingNamesAll.has(key) || existingUrlsAll.has(normalizeUrl(url)) || byName.has(key)) continue;
  byName.set(key, { name, genre, url });
}
const quotas = { Shooting: 15, Sports: 12, Racing: 12, Fighting: 16, RPG: 12, Adventure: 3, Survival: 10, Strategy: 12, Platformer: 8, Action: 6, 'Co-op': 6, 'Battle Royale': 3 };
const selected = [];
for (const [genre, quota] of Object.entries(quotas)) {
  selected.push(...[...byName.values()].filter((game) => game.genre === genre).slice(0, quota));
}
if (selected.length !== 115) throw new Error(`Candidate genre quotas selected ${selected.length} games, expected 115`);
function slugify(s) { return normalize(s).replace(/^$/, 'game'); }
const rows = [];
for (const {name, genre, url} of selected) {
  const prior = priorBySlug.get(slugify(name));
  const multiplayer = /Co-op|Multiplayer|Battle Royale|Shooting|Fighting/i.test(genre) || /io\/|multiplayer|wrestle|bunny|duo|team battle|battle royale/i.test(name) ? 'Server' : 'None';
  const controls = prior?.controls || 'Use the on-screen controls or the controls shown on the game page.';
  rows.push({
    slug: slugify(name), name, url, genre,
    ...(prior?.released ? { released: prior.released } : {}),
    ...(prior?.rating ? { rating: prior.rating } : {}),
    multiplayer,
    tags: [genre, ...(multiplayer === 'Server' ? ['Multiplayer'] : []), 'Free to Play', 'Browser Game'].join('|'),
    description: `${name} is offered as a free browser game on ${url.includes('poki.com') ? 'Poki' : 'CrazyGames'}; launch it directly from this game page.`,
    objectives: prior?.objectives || `Start a session|Learn the game mechanics|Complete a round or level`,
    controls,
    briefing: prior?.briefing || `Launch ${name} from its browser-game page and follow the in-game instructions.`,
  });
}
if (rows.length !== 115) throw new Error(`Expected 115 distinct new browser games, got ${rows.length}`);
const usedSlugs = new Set();
for (const row of rows) { if (usedSlugs.has(row.slug)) throw new Error(`Duplicate slug ${row.slug}`); usedSlugs.add(row.slug); }
const start = rowsNode.getStart(sf);
const end = rowsNode.getEnd();
const rendered = `const ROWS: RefreshRow[] = [\n${rows.map((row) => `  {\n${Object.entries(row).map(([k,v]) => `    ${k}: ${JSON.stringify(v)},`).join('\n')}\n  },`).join('\n')}\n];`;
const nextRefresh = refreshText.slice(0, start) + rendered + refreshText.slice(end);
fs.writeFileSync(refreshPath, nextRefresh);

const retiredIds = oldRows.map((r) => `spot-${r.slug}`);
let premium = fs.readFileSync(premiumPath, 'utf8');
for (const id of retiredIds) {
  premium = premium.replace(`'${id}',`, '');
  premium = premium.replace(`'${id}'`, '');
}
const premiumStart = premium.indexOf("  {\n    id: 'premium-free-browser-play'");
if (premiumStart < 0) throw new Error('Cannot locate premium browser rail');
const premiumEnd = premium.indexOf('\n] as const;', premiumStart);
if (premiumEnd < 0) throw new Error('Cannot locate end of premium rails');
const browserRails = `  {\n    id: 'premium-free-browser-play',\n    title: 'Free browser play',\n    subtitle: 'No install or purchase required; open a game page and play. Accounts are optional.',\n    gameIds: GENRE_REFRESH_GAMES.map((game) => game.id),\n    maxItems: 115,\n  },`;
premium = premium.slice(0, premiumStart) + browserRails + premium.slice(premiumEnd);
fs.writeFileSync(premiumPath, premium);
console.log(`Replaced ${oldRows.length} store/publisher-only entries with ${rows.length} browser game pages.`);