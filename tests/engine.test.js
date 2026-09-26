import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,SYMBOLS,validateConfig,evaluate,pickSymbol,rewardFor,prizeOdds,playerTotals,jackpotSummary} from '../scripts/engine.js';
const reward=reels=>rewardFor({reels,...evaluate(reels)},DEFAULT_CONFIG);
test('five reels pay item tiers and only matching symbols from the left',()=>{
  assert.equal(reward(['caps','caps','caps','mic','mic']).multiplier,1);
  assert.equal(reward(['memory','memory','memory','caps','mic']).tier,'common');
  assert.equal(reward(['caps','caps','caps','caps','mic']).tier,'rare');
  assert.equal(reward(Array(5).fill('caps')).tier,'jackpot');
  assert.equal(reward(['mic','caps','caps','caps','caps']).tier,null);
  assert.equal(reward(Array(5).fill('people')).jackpot,true);
  assert.equal(reward(Array(5).fill('people')).multiplier,0);
  assert.throws(()=>evaluate(['caps','caps','caps']));
});
test('weighted selection respects boundaries',()=>{
  assert.equal(pickSymbol(SYMBOLS,()=>0),'caps');assert.equal(pickSymbol(SYMBOLS,()=>.29999),'caps');
  assert.equal(pickSymbol(SYMBOLS,()=>.3),'memory');assert.equal(pickSymbol(SYMBOLS,()=>.999999),'people');
  assert.throws(()=>pickSymbol(SYMBOLS,()=>1));
});
test('a restricted jackpot only awards its selected symbol; other five-matches stay rare',()=>{
  const c={...DEFAULT_CONFIG,jackpotSymbol:'people'};
  assert.equal(rewardFor({reels:Array(5).fill('caps'),count:5},c).tier,'rare');
  assert.equal(rewardFor({reels:Array(5).fill('people'),count:5},c).tier,'jackpot');
  assert.ok(Math.abs(prizeOdds(c).jackpotRate-.06**5)<1e-15);
});
test('all 7,776 outcomes agree with analytical prize and jackpot probabilities',()=>{
  let hit=0,jackpot=0,item=0,caps=0,count=0;
  const walk=(reels,p)=>{
    if(reels.length===5){const r=reward(reels);if(r.multiplier||r.tier)hit+=p;if(r.jackpot)jackpot+=p;if(r.tier)item+=p;caps+=p*r.multiplier;count++;return;}
    for(const s of SYMBOLS)walk([...reels,s.id],p*s.weight/100);
  };
  walk([],1);const a=prizeOdds(DEFAULT_CONFIG);
  assert.equal(count,7776);assert.ok(Math.abs(hit-a.hitRate)<1e-12);assert.ok(Math.abs(jackpot-a.jackpotRate)<1e-12);
  assert.ok(Math.abs(item-a.itemRate)<1e-12);assert.ok(Math.abs(caps-a.capReturnRate)<1e-12);
  assert.ok(a.jackpotRate>0.003&&a.jackpotRate<0.004);
});
test('config migration replaces cap prizes without changing existing receipts',()=>{
  const old={...structuredClone(DEFAULT_CONFIG),schema:undefined,wagers:[1,5,10]};delete old.prizes;
  const c=validateConfig(old);assert.equal(c.schema,2);assert.deepEqual(c.wagers,[5]);assert.equal(c.prizes.jackpot.length,3);
});
test('configuration rejects malformed prize bundles and unsafe quantities',()=>{
  for(const wager of [-1,0,1.2,Infinity,10001])assert.throws(()=>validateConfig({...DEFAULT_CONFIG,wagers:[wager]}));
  assert.throws(()=>validateConfig({...DEFAULT_CONFIG,symbols:SYMBOLS.slice(1)}));
  const c=structuredClone(DEFAULT_CONFIG);c.prizes.jackpot=[];assert.throws(()=>validateConfig(c));
  c.prizes.jackpot=[{name:'Bad',uuid:'javascript:alert(1)',quantity:1}];assert.throws(()=>validateConfig(c));
  c.prizes.jackpot=[{name:'Good',uuid:'Item.abc',quantity:0}];assert.throws(()=>validateConfig(c));
  assert.deepEqual(validateConfig({...DEFAULT_CONFIG,wagers:[5,1,5]}).wagers,[1,5]);
});
test('losses persist across actors, subtract refunds, distinguish items and exclude practice',()=>{
  const history=[
    {userId:'p',actorId:'a',wager:5,payout:0,awards:[],at:1},
    {userId:'p',actorId:'b',wager:5,payout:0,awards:[{quantity:3}],jackpot:true,schema:2,at:2},
    {userId:'p',wager:5,payout:0,refund:{amount:5},at:3},
    {userId:'p',wager:5,payout:5,at:4},
    {userId:'p',wager:100,payout:0,practice:true,at:5},
    {userId:'other',wager:5,payout:0,at:6}
  ];
  const t=playerTotals(JSON.parse(JSON.stringify(history)),'p');
  assert.deepEqual(t,{spins:4,wagered:20,returned:5,refunded:5,losses:10,losingSpins:1,itemsWon:3,jackpots:1,net:-10});
  assert.equal(playerTotals(history).losses,15);
});
test('jackpot history ignores practice and legacy cap jackpots',()=>{
  const h=[{schema:2,jackpot:true,actorName:'Charlie',at:10,awards:[]},{schema:2,jackpot:true,practice:true,at:30},{jackpot:true,at:40}];
  const s=jackpotSummary(h);assert.equal(s.wins,1);assert.equal(s.lastWinner.name,'Charlie');assert.equal(s.spinsSince,1);
});
