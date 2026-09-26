export const ID = "goodneighbor-slots";
export const CAPS = "system.currency.caps";
export const SYMBOLS = [
  { id: "caps", name: "Bottle caps", short: "CAPS", weight: 30 },
  { id: "memory", name: "Memory Den", short: "MEMORY DEN", weight: 22 },
  { id: "mic", name: "Third Rail mic", short: "THIRD RAIL", weight: 18 },
  { id: "cocktail", name: "Neon cocktail", short: "NIGHTCAP", weight: 14 },
  { id: "hat", name: "Hancock’s tricorn", short: "THE MAYOR", weight: 10 },
  { id: "people", name: "Of the People", short: "OF THE PEOPLE", weight: 6 }
];
export const DEFAULT_CONFIG = {
  schema: 2,
  name: "Goodneighbor Social Club", wagers: [5], paused: false,
  blocked: [], practice: false, publicReceipts: false, symbols: SYMBOLS,
  prizes: {
    common: [{name:"Third Rail drink voucher",uuid:"",quantity:1}],
    rare: [{name:"Hancock’s engraved lighter",uuid:"",quantity:1}],
    jackpot: [{name:"Mayor’s presentation tricorn",uuid:"",quantity:1},{name:"Memory Den private-session pass",uuid:"",quantity:1},{name:"Magnolia’s signed record",uuid:"",quantity:1}]
  },
  jackpotSymbol: "any"
};
export function upgradeConfig(value) {
  const c=structuredClone(value);
  if(c.schema!==2){c.schema=2;c.prizes=structuredClone(DEFAULT_CONFIG.prizes);c.jackpotSymbol="any";c.wagers=[5];}
  for(const symbol of c.symbols||[])delete symbol.pays;
  return c;
}
export function validateConfig(value) {
  const c = upgradeConfig(value);
  if (!c || typeof c.name !== "string" || !c.name.trim() || c.name.length > 80) throw Error("Give the machine a name (1–80 characters).");
  if (!Array.isArray(c.wagers) || !c.wagers.length || c.wagers.length > 8 || c.wagers.some(n => !Number.isSafeInteger(n) || n < 1 || n > 10000)) throw Error("Use 1–8 whole-cap wagers between 1 and 10,000.");
  c.wagers = [...new Set(c.wagers)].sort((a,b) => a-b);
  if (!Array.isArray(c.symbols) || c.symbols.length !== 6) throw Error("Exactly six symbol definitions are required.");
  for (let i=0; i<6; i++) {
    const s = c.symbols[i];
    if (s.id !== SYMBOLS[i].id || typeof s.name !== "string" || !s.name.trim() || s.name.length > 60 || typeof s.short !== "string" || s.short.length > 24) throw Error("Keep the six symbol IDs and supply short display names.");
    if (!Number.isSafeInteger(s.weight) || s.weight < 1 || s.weight > 1000) throw Error("Symbol weights must be integers from 1 to 1,000.");
  }
  if (!Array.isArray(c.blocked) || c.blocked.some(id => typeof id !== "string")) throw Error("Blocked players must be user IDs.");
  for (const k of ["paused", "practice", "publicReceipts"]) if (typeof c[k] !== "boolean") throw Error(`${k} must be true or false.`);
  if(!['any',...SYMBOLS.map(s=>s.id)].includes(c.jackpotSymbol))throw Error('Choose any or a symbol ID for the jackpot trigger.');
  for(const tier of ['common','rare','jackpot']){
    const bundle=c.prizes?.[tier];
    if(!Array.isArray(bundle)||!bundle.length||bundle.length>10)throw Error(`${tier} needs 1–10 prize items.`);
    for(const p of bundle){
      if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100)throw Error('Each prize needs a name of 1–100 characters.');
      if(typeof p.uuid!=='string'||(p.uuid&&!/^(Item\.|Compendium\.)[A-Za-z0-9._-]+$/.test(p.uuid)))throw Error('Use an Item or Compendium UUID, or leave it blank for a custom souvenir.');
      if(!Number.isSafeInteger(p.quantity)||p.quantity<1||p.quantity>100)throw Error('Prize quantity must be 1–100.');
    }
  }
  return c;
}
// Version 2 replaces large cap multipliers with item bundles.
export function rewardFor(result,config) {
  const jackpot=result.count===5 && (config.jackpotSymbol==='any'||result.reels[0]===config.jackpotSymbol);
  const tier=jackpot?'jackpot':result.count>=4?'rare':result.count===3&&result.reels[0]!=='caps'?'common':null;
  return {jackpot,tier,multiplier:!tier&&result.count===3?1:0,prizes:tier?structuredClone(config.prizes[tier]):[]};
}
export function prizeOdds(config) {
  const total=config.symbols.reduce((n,s)=>n+s.weight,0);
  let jackpotRate=0,itemRate=0,capReturnRate=0;
  for(const s of config.symbols){const p=s.weight/total;
    if(config.jackpotSymbol==='any'||config.jackpotSymbol===s.id)jackpotRate+=p**5;
    itemRate+=p**4;
    if(s.id==='caps')capReturnRate+=p**3*(1-p);else itemRate+=p**3*(1-p);
  }
  return {jackpotRate,itemRate,capReturnRate,hitRate:itemRate+capReturnRate};
}
export function playerTotals(records,userId) {
  const totals={spins:0,wagered:0,returned:0,refunded:0,losses:0,losingSpins:0,itemsWon:0,jackpots:0,net:0};
  for(const r of records){
    if(r.practice||(userId!==undefined&&r.userId!==userId))continue;
    const refund=r.refund?.amount||0;
    totals.spins++;totals.wagered+=r.wager;totals.returned+=r.payout;totals.refunded+=refund;
    const loss=Math.max(0,r.wager-r.payout-refund);totals.losses+=loss;
    // A cap cost on an item-winning spin is not a losing spin.
    if(!r.payout&&!r.awards?.length&&loss>0)totals.losingSpins++;
    totals.itemsWon+=(r.awards||[]).reduce((n,a)=>n+a.quantity,0);
    totals.jackpots+=r.jackpot?1:0;
  }
  totals.net=totals.returned+totals.refunded-totals.wagered;
  return totals;
}
export function jackpotSummary(records) {
  const real=records.filter(r=>!r.practice).sort((a,b)=>b.at-a.at);
  const wins=real.filter(r=>r.schema===2&&r.jackpot);
  const latest=wins[0];
  return {wins:wins.length,spinsSince:latest?real.filter(r=>r.at>latest.at).length:real.length,
    lastWinner:latest?{name:latest.actorName,at:latest.at,prizes:(latest.awards||[]).map(a=>`${a.quantity}× ${a.name}`).join(', ')}:null};
}
export function pickSymbol(symbols, random = Math.random) {
  const total = symbols.reduce((n,s) => n+s.weight,0);
  let r = random() * total;
  if (!Number.isFinite(r) || r < 0 || r >= total) throw Error("Invalid random sample.");
  for (const s of symbols) { r -= s.weight; if (r < 0) return s.id; }
}
export function evaluate(reels, symbols = SYMBOLS) {
  if (reels.length !== 5 || reels.some(id => !symbols.some(s => s.id === id))) throw Error("Invalid five-reel result.");
  let count = 1;
  while (count < 5 && reels[count] === reels[0]) count++;
  return { count };
}
export function spin(config, random) {
  const reels = Array.from({length:5}, () => pickSymbol(config.symbols, random));
  const result={reels,...evaluate(reels,config.symbols)};
  return {...result,...rewardFor(result,config)};
}
export const odds = (config=DEFAULT_CONFIG) => prizeOdds(config);
export class KeyedQueue {
  #tails = new Map();
  run(key, fn) {
    const task=(this.#tails.get(key) ?? Promise.resolve()).then(fn);
    const tail=task.catch(() => {});
    this.#tails.set(key,tail);
    tail.then(() => {if(this.#tails.get(key)===tail) this.#tails.delete(key);});
    return task;
  }
}
export function safeBalance(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw Error("Character caps must be a nonnegative whole number.");
  return n;
}
