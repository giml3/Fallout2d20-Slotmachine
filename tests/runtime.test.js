import {test} from 'node:test';
import assert from 'node:assert/strict';
test('Foundry entry point registers settings, menus, API and socket receiver',async()=>{
  const hooks=new Map(),settings=new Map(),menus=new Map(),listeners=new Map(),modules=new Map([['goodneighbor-slots',{}]]);
  globalThis.Hooks={once:(name,fn)=>hooks.set(name,fn),on:(name,fn)=>hooks.set(name,fn)};
  let renders=0,fronts=0;
  globalThis.foundry={applications:{api:{ApplicationV2:class{
    get state(){return 0;}
    async render(options){assert.equal(options.force,true);renders++;return this;}
    bringToFront(){fronts++;}
  },DialogV2:{}}}};
  globalThis.game={user:{id:'gm',isGM:true},settings:{register:(_id,key,c)=>settings.set(key,c.default),registerMenu:(_id,key,c)=>menus.set(key,c),get:(_id,key)=>settings.get(key)},actors:{contents:[]},users:{contents:[],get:()=>undefined},modules,socket:{on:(name,fn)=>listeners.set(name,fn)}};
  globalThis.ui={notifications:{warn:()=>{}}};
  await import('../scripts/main.js');hooks.get('init')();hooks.get('ready')();
  assert.ok(menus.has('play'));assert.ok(menus.get('overseer').restricted);
  assert.equal(typeof modules.get('goodneighbor-slots').api.open,'function');
  assert.ok(listeners.has('module.goodneighbor-slots'));
  assert.ok(hooks.has('renderChatMessageHTML'));
  // ApplicationV2.state is read-only; constructing the player window must not
  // overwrite it. Exercise the actual public launcher, not only registration.
  game.user.isGM=false;
  const app=modules.get('goodneighbor-slots').api.open();
  assert.ok(app);assert.equal(app.state,0);assert.equal(app.slotState.wager,5);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(renders,1);assert.equal(fronts,1);
  assert.equal(modules.get('goodneighbor-slots').api.open(),app);
});
