import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ID,DEFAULT_CONFIG,CAPS} from '../scripts/engine.js';
import {Transactions} from '../scripts/transactions.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function setup({count=1,caps=100,random=()=>0,fail=false,afterCommit=false,itemFailAt=0,itemLostResponse=false,deliveryWriteFail=false}={}){
  const config=structuredClone(DEFAULT_CONFIG),players=Array.from({length:count},(_,i)=>({id:`p${i}`,name:`Player ${i}`,active:true}));
  const gm={id:'gm',name:'GM',active:true,isGM:true};let inFlight=0,peak=0,writes=0,itemWrites=0,itemAttempts=0;
  const actors=Array.from({length:count},(_,i)=>({id:`a${i}`,name:`Actor ${i}`,system:{currency:{caps}},ledger:{},items:new Map(),
    testUserPermission:user=>user.id===players[i].id||user.isGM,
    getFlag(_ns,key){return this.ledger[key.replace('transactions.','')];},
    async update(data){inFlight++;peak=Math.max(inFlight,peak);await delay(5);inFlight--;
      const money=Object.hasOwn(data,CAPS);
      if((money&&fail&&!afterCommit)||(!money&&deliveryWriteFail)){deliveryWriteFail=false;throw Error('network lost');}
      if(money){this.system.currency.caps=data[CAPS];writes++;}for(const [k,v]of Object.entries(data))if(k.startsWith(`flags.${ID}.transactions.`))this.ledger[k.split('.').at(-1)]=structuredClone(v);
      if(money&&fail&&afterCommit)throw Error('response lost');
    },
    async createEmbeddedDocuments(type,docs,options){
      assert.equal(type,'Item');assert.equal(options.keepId,true);
      for(const d of docs){itemAttempts++;if(itemAttempts===itemFailAt)throw Error('item failure');
        if(this.items.has(d._id))throw Error('duplicate ID');
        this.items.set(d._id,{...d,getFlag:(ns,key)=>d.flags[ns][key]});itemWrites++;
        if(itemLostResponse){itemLostResponse=false;throw Error('item response lost');}
      }
    }}));
  const pending=new Map();
  const service=new Transactions({config:()=>config,actor:id=>actors.find(a=>a.id===id),user:id=>id?players.find(p=>p.id===id):gm,random,
    begin:async p=>pending.set(p.id,p),finish:async id=>pending.delete(id),blocked:id=>[...pending.values()].some(p=>p.actorId===id)});
  const req=(i=0,id=`spin_request_0000${i}`)=>({id,actorId:`a${i}`,userId:`p${i}`,wager:5});
  return {service,actors,players,config,req,pending,stats:()=>({peak,writes,itemWrites})};
}
test('six players settle concurrently with isolated balances',async()=>{
  const s=setup({count:6});const results=await Promise.all(s.players.map((_,i)=>s.service.play(s.req(i))));
  assert.equal(s.stats().peak,6);assert.equal(s.stats().writes,6);
  for(const r of results){assert.equal(r.payout,0);assert.equal(r.after,95);assert.equal(r.delivery,'delivered');}
  for(const a of s.actors){assert.equal(a.system.currency.caps,95);assert.equal(a.items.size,3);}
});
test('repeated requests across simultaneous windows settle once',async()=>{
  const s=setup();const results=await Promise.all(Array.from({length:6},()=>s.service.play(s.req())));
  assert.equal(s.stats().writes,1);assert.equal(results.filter(r=>r.replay).length,5);
  assert.equal(s.stats().itemWrites,3);
});
test('two simultaneous wagers cannot overspend the same actor',async()=>{
  let n=0;const s=setup({caps:5,random:()=>[0,.5,.7,.8,.9][n++%5]});
  const results=await Promise.allSettled([s.service.play(s.req()),s.service.play(s.req(0,'second_spin_00000'))]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(s.actors[0].system.currency.caps,0);
});
test('ownership, funds, blocked access, pause and cashier restrictions are checked',async()=>{
  let s=setup();await assert.rejects(s.service.play({...s.req(),userId:'stranger'}),/own/);
  s=setup({caps:1});await assert.rejects(s.service.play(s.req()),/Not enough/);
  s=setup();s.config.blocked=['p0'];await assert.rejects(s.service.play(s.req()),/disabled/);
  s=setup();s.config.paused=true;await assert.rejects(s.service.play(s.req()),/paused/);
  s=setup();s.service.authority=()=>false;await assert.rejects(s.service.play(s.req()),/cashier/);
});
test('practice records results without spending caps',async()=>{
  const s=setup({caps:0});s.config.practice=true;const r=await s.service.play(s.req());
  assert.equal(r.payout,0);assert.equal(r.after,0);assert.equal(r.net,0);assert.equal(r.awards.length,3);assert.equal(s.stats().itemWrites,0);
});
test('a lost response after commit recovers the saved result without paying twice',async()=>{
  const s=setup({fail:true,afterCommit:true});await assert.rejects(s.service.play(s.req()),/uncertain/);
  const r=await s.service.play(s.req());assert.equal(r.replay,true);assert.equal(s.stats().writes,1);
  assert.equal(s.pending.size,1);
});
test('failed updates preserve a durable hold and block new requests',async()=>{
  const s=setup({fail:true});await assert.rejects(s.service.play(s.req()),/uncertain/);
  assert.equal(s.pending.size,1);s.service.uncertain.clear();
  await assert.rejects(s.service.play(s.req(0,'second_spin_00000')),/reconcile/);
  assert.equal(s.actors[0].system.currency.caps,100);
});
test('refund is idempotent and preserves a reason and original payout',async()=>{
  const s=setup();await s.service.play(s.req());
  const results=await Promise.all([s.service.refund('a0',s.req().id,'Courtesy'),s.service.refund('a0',s.req().id,'Courtesy')]);
  assert.equal(s.actors[0].system.currency.caps,100);assert.equal(s.stats().writes,2);
  assert.equal(results[0].refund.reason,'Courtesy');assert.equal(results[0].payout,0);assert.equal(s.actors[0].items.size,3);
});
test('a persisted receipt is recoverable after service restart and pause',async()=>{
  const s=setup();await s.service.play(s.req());s.config.paused=true;
  const second=new Transactions({config:()=>s.config,actor:()=>s.actors[0],user:id=>id?s.players[0]:{id:'gm'}});
  assert.equal((await second.play(s.req())).replay,true);assert.equal(s.stats().writes,1);
});
test('overflow and changed wagers cannot mutate a saved transaction',async()=>{
  const s=setup();await s.service.play(s.req());s.actors[0].system.currency.caps=Number.MAX_SAFE_INTEGER;await assert.rejects(s.service.refund('a0',s.req().id,'Test'),/whole number/);assert.equal(s.stats().writes,1);
  const t=setup();await t.service.play(t.req());await assert.rejects(t.service.play({...t.req(),wager:10}),/already used/);
});
test('a partial jackpot delivery resumes only missing items without charging again',async()=>{
  const s=setup({itemFailAt:2});const r=await s.service.play(s.req());
  assert.equal(r.delivery,'pending');assert.equal(s.actors[0].items.size,1);assert.equal(s.stats().writes,1);
  const recovered=await s.service.deliverPrizes('a0',r.id);
  assert.equal(recovered.delivery,'delivered');assert.equal(s.actors[0].items.size,3);assert.equal(s.stats().writes,1);
});
test('lost item creation response is recovered without duplicating an item',async()=>{
  const s=setup({itemLostResponse:true});const r=await s.service.play(s.req());
  assert.equal(r.delivery,'pending');assert.equal(s.actors[0].items.size,1);
  await s.service.deliverPrizes('a0',r.id);assert.equal(s.stats().itemWrites,3);assert.equal(s.stats().writes,1);
});
test('delivery receipt failure retries safely and delivered consumables are never recreated',async()=>{
  const s=setup({deliveryWriteFail:true});const r=await s.service.play(s.req());assert.equal(r.delivery,'pending');assert.equal(s.actors[0].items.size,3);
  await s.service.deliverPrizes('a0',r.id);s.actors[0].items.clear();
  await s.service.play(s.req());assert.equal(s.actors[0].items.size,0);assert.equal(s.stats().itemWrites,3);
});
test('missing configured prize UUID fails before any caps are charged',async()=>{
  const s=setup();s.config.prizes.jackpot[0].uuid='Item.missing';await assert.rejects(s.service.play(s.req()),/unavailable/);
  assert.equal(s.stats().writes,0);assert.equal(s.actors[0].system.currency.caps,100);
});
test('exactly three caps return only the wager with no inventory award',async()=>{
  let index=0;const s=setup({random:()=>[0,0,0,.3,.4][index++%5]});const r=await s.service.play(s.req());
  assert.equal(r.payout,5);assert.equal(r.after,100);assert.equal(r.awards.length,0);assert.equal(s.stats().itemWrites,0);
});
test('saved jackpot contents survive later prize configuration changes',async()=>{
  const s=setup({itemFailAt:1});const r=await s.service.play(s.req());const expected=r.awards.map(a=>a.name);
  s.config.prizes.jackpot=[{name:'Different future prize',uuid:'',quantity:20}];
  await s.service.deliverPrizes('a0',r.id);
  assert.deepEqual([...s.actors[0].items.values()].map(i=>i.name),expected);
});
