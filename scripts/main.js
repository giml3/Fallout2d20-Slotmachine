import {ID, DEFAULT_CONFIG, validateConfig, KeyedQueue, prizeOdds, playerTotals, jackpotSummary} from "./engine.js";
import {Transactions} from "./transactions.js";
import {animateReels} from './reels.js';
import {machineView, monitorView, esc, rewardText} from "./views.js";

const {ApplicationV2, DialogV2}=foundry.applications.api;
const channel=`module.${ID}`, sessions=new Map(), events=[], requests=new Map(), adminQueue=new KeyedQueue();
const started=Date.now();
let machine, monitor, transactions;
const config=()=>validateConfig(game.settings.get(ID,"machine"));
const cashier=()=>game.users.get(game.settings.get(ID,"cashier"));
const isCashier=()=>game.user.isGM && cashier()?.id===game.user.id && game.user.active;
const cashierOnline=()=>Boolean(cashier()?.active && cashier()?.isGM);
const uuid=()=>crypto.randomUUID();
const refresh=()=>{if(machine?.rendered && !machine.state.busy) machine.render(); if(monitor?.rendered) monitor.render();};
const records=()=>game.actors.contents.flatMap(a=>Object.values(a.getFlag(ID,"transactions")||{})).sort((a,b)=>b.at-a.at);
function playerRoster(history){
  const users=new Map(game.users.filter(u=>!u.isGM).map(u=>[u.id,u]));
  for(const r of history)if(!users.has(r.userId))users.set(r.userId,game.users.get(r.userId)||{id:r.userId,name:`${r.userName} (former player)`,active:false});
  return [...users.values()];
}
function publishJackpot(){return adminQueue.run('jackpot',async()=>{if(isCashier())await game.settings.set(ID,'jackpotBoard',jackpotSummary(records()));});}
const pendingUpdates=()=>game.users.contents.flatMap(u=>Object.values(u.getFlag(ID,"pending")||{}).map(p=>({...p,gmId:u.id,actorName:game.actors.get(p.actorId)?.name||p.actorId})));
function activity(text,category="session",extra={}) {
  events.unshift({at:Date.now(),text,category,...extra});
  events.splice(1000);
  if(monitor?.rendered) monitor.render();
}
async function audit(text,extra={}) {
  const e={at:Date.now(),text,category:"admin",userName:game.user.name,userId:game.user.id,...extra};
  await game.user.setFlag(ID,`audit.${uuid()}`,e);
  broadcast({type:"audit",event:e,gmId:game.user.id});
}
function broadcast(packet) {game.socket.emit(channel,packet); void receive(packet);}
function report(action,actorId,wager) {
  broadcast({type:"presence",userId:game.user.id,action,actorId,wager});
}
function requireGM() {if(!game.user.isGM) throw Error("Only a GM can do that.");}
function requireCashier() {requireGM(); if(!isCashier()) throw Error("Use the assigned cashier GM for this action.");}
function notifyError(error){console.error(`${ID} |`,error);ui.notifications.error(error.message||String(error));}
function currentRequestKey(){return `${ID}.${game.world.id}.${game.user.id}.pending`;}
function readPending(){try{return JSON.parse(localStorage.getItem(currentRequestKey())||"null");}catch{return null;}}
function savePending(req){if(req)localStorage.setItem(currentRequestKey(),JSON.stringify(req));else localStorage.removeItem(currentRequestKey());}
async function sendSpin(req) {
  if(!cashierOnline()) throw Error("The assigned cashier GM must be online.");
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{requests.delete(req.id);reject(Error("No confirmation yet. Use ‘Check pending spin’ to retrieve the same transaction."));},15000);
    requests.set(req.id,{resolve,reject,timer});
    broadcast({type:"spin",...req});
  });
}
async function receive(p) {
  if(!p || typeof p!=="object") return;
  try {
    if(p.type==="presence" && game.user.isGM) {
      const u=game.users.get(p.userId), a=game.actors.get(p.actorId);
      if(!u?.active || (a && !a.testUserPermission(u,"OWNER"))) return;
      const labels={open:"Opened machine",character:"Selected character",wager:"Changed wager",spinning:"Reels spinning",complete:"Spin animation completed",close:"Closed machine"};
      if(!labels[p.action]) return;
      sessions.set(u.id,{actorId:a?.id,wager:config().wagers.includes(p.wager)?p.wager:undefined,status:labels[p.action]});
      activity(`${labels[p.action]}${a?` · ${a.name}`:''}${p.action==='wager'?` · ${p.wager} caps`:''}`,"session",{userId:u.id,userName:u.name});
    }
    if(p.type==="spin" && isCashier()) {
      const u=game.users.get(p.userId);
      if(!u?.active) return;
      const extra={userId:u.id,userName:u.name,actorId:p.actorId,spinId:p.id};
      activity(`Spin requested · ${p.wager} caps`,"transaction",extra);
      try {
        if(game.system.id!=="fallout") throw Error("Automatic caps require the Fallout system.");
        const result=await transactions.play(p);
        void publishJackpot().catch(notifyError);
        broadcast({type:"result",gmId:game.user.id,to:u.id,id:p.id,result});
        if(!result.replay) {
          void receipt(result).catch(e=>{activity(`Caps settled; chat receipt failed: ${e.message}`,"error",extra);});
        }
      } catch(error) {
        const uncertain=pendingUpdates().some(x=>x.actorId===p.actorId);
        broadcast({type:"result",gmId:game.user.id,to:u.id,id:p.id,error:error.message,uncertain});
      }
    }
    if(p.type==="result" && p.gmId===cashier()?.id) {
      const r=p.result;
      if(game.user.isGM) {
        const user=game.users.get(p.to);
        activity(p.error?`Spin rejected / review needed · ${p.error}`:`${r.replay?'Receipt recovered':'Spin settled'} · ${r.wager} caps → ${rewardText(r)} · balance ${r.after}${r.practice?' · PRACTICE':''}`,
          p.error?"error":r.jackpot?"jackpot":"transaction",{userId:p.to,userName:user?.name,actorId:r?.actorId,spinId:r?.id});
        if(r) sessions.set(p.to,{actorId:r.actorId,wager:r.wager,status:rewardText(r)});
        if(r?.deliveryError)activity(`Prize delivery requires review: ${r.deliveryError}`,'error',{userId:p.to,userName:user?.name,actorId:r.actorId,spinId:r.id});
      }
      if(p.to===game.user.id) {
        const waiting=requests.get(p.id);
        if(waiting){clearTimeout(waiting.timer);requests.delete(p.id);if(p.error)waiting.reject(Object.assign(Error(p.error),{definitive:!p.uncertain}));else waiting.resolve(r);}
      }
      refresh();
    }
    if(p.type==="audit" && game.user.isGM && game.users.get(p.gmId)?.isGM) activity(p.event.text,"admin",p.event);
  } catch(e) {console.error(`${ID} socket`,e);}
}
async function receipt(r) {
  const names=r.reels.map(id=>config().symbols.find(s=>s.id===id)?.name||id);
  await ChatMessage.create({user:game.user.id,speaker:{alias:r.actorName},
    whisper:config().publicReceipts?[]:[...new Set([r.userId,...game.users.filter(u=>u.isGM).map(u=>u.id)])],
    content:`<h3>Goodneighbor Slots ${r.practice?'· Practice':''}</h3><p>${names.map(esc).join(' · ')}</p><p><b>${esc(rewardText(r))}</b></p><p>Wager: <b>${r.wager}</b> · Caps back: <b>${r.payout}</b> · Cap net: <b>${r.net}</b> · Balance: <b>${r.after}</b></p><small>Spin ${esc(r.id)}</small>`});
}
class SlotsApplication extends ApplicationV2 {
  static DEFAULT_OPTIONS={classes:[ID],position:{width:680,height:"auto"},window:{title:"Goodneighbor Slots",resizable:true}};
  _replaceHTML(html,content){content.innerHTML=html;}
  _onRender(context,options){
    super._onRender(context,options);
    this.element.querySelector('.gn-shell')?.addEventListener('click',event=>{
      const button=event.target.closest('button[data-action]');
      if(button && !button.disabled) void Promise.resolve(this.act(button.dataset.action,button)).catch(notifyError);
    });
  }
}
export class SlotMachine extends SlotsApplication {
  constructor(...args){super(...args);this.state={wager:config().wagers[0],actorId:game.user.character?.id||"",mute:game.settings.get(ID,"mute"),reduced:game.settings.get(ID,"reduced"),pending:readPending()};machine=this;}
  async _renderHTML(){
    const c=config();
    if(!c.wagers.includes(this.state.wager))this.state.wager=c.wagers[0];
    const actors=game.actors.filter(a=>a.testUserPermission(game.user,"OWNER") && Number.isSafeInteger(a.system?.currency?.caps));
    if(!actors.some(a=>a.id===this.state.actorId))this.state.actorId=actors[0]?.id||"";
    return machineView({...this.state,config:c,actors,jackpot:game.settings.get(ID,'jackpotBoard'),isGM:game.user.isGM,connected:cashierOnline(),balance:game.actors.get(this.state.actorId)?.system?.currency?.caps});
  }
  _onRender(context,options){
    super._onRender(context,options);
    if(!this.present){this.present=true;report('open',this.state.actorId,this.state.wager);}
    this.element.classList.toggle('gn-reduced',this.state.reduced);
    this.element.querySelector('[name=actor]').addEventListener('change',e=>{this.state.actorId=e.target.value;report('character',this.state.actorId,this.state.wager);this.render();});
    for(const [name,key,setting] of [['mute','mute','mute'],['motion','reduced','reduced']]) this.element.querySelector(`[name=${name}]`).addEventListener('change',e=>{this.state[key]=e.target.checked;void game.settings.set(ID,setting,e.target.checked);this.element.classList.toggle('gn-reduced',this.state.reduced);});
    this.element.querySelector('details').addEventListener('toggle',e=>{this.state.paytableOpen=e.target.open;});
  }
  async act(action,button){
    if(action==='monitor')return openMonitor();
    if(action==='wager'){this.state.wager=Number(button.dataset.wager);report('wager',this.state.actorId,this.state.wager);return this.render();}
    if(action==='spin'||action==='retry') {
      if(this.state.busy)return;
      if(this.state.pending && action==='spin')throw Error("Check your pending spin before wagering again.");
      const req=action==='retry'?this.state.pending:{id:uuid(),actorId:this.state.actorId,userId:game.user.id,wager:this.state.wager};
      if(!req)return;
      savePending(req);this.state.pending=req;this.state.busy=true;this.state.message='The cashier is checking your wager…';await this.render();
      try {
        const r=await sendSpin(req);
        this.state.message=r.replay?'Recovered your saved result.':'Wager settled. Let the reels roll…';
        report('spinning',req.actorId,req.wager);
        await this.animate(r);
        this.state.message=`${r.practice?'PRACTICE · ':''}${rewardText(r)} · Cap net ${r.net>0?'+':''}${r.net}`;
        savePending(null);this.state.pending=null;
        report('complete',req.actorId,req.wager);
      }catch(error){this.state.message=error.message;if(error.definitive){savePending(null);this.state.pending=null;}}
      finally{this.state.busy=false;if(this.rendered)await this.render();}
    }
  }
  async animate(r){
    await animateReels(this.element,r.reels,config().symbols,{
      reduced:()=>this.state.reduced||r.replay,
      onStop:i=>{if(!this.state.mute&&!r.replay)this.tone(200+i*65);}
    });
    this.state.reels=r.reels;
  }
  tone(frequency){try{const ctx=this.audio??=new AudioContext();void ctx.resume();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=frequency;gain.gain.setValueAtTime(.025,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.1);osc.start();osc.stop(ctx.currentTime+.11);}catch{/* Audio is optional. */}}
  async close(options){this.present=false;report('close',this.state.actorId,this.state.wager);return super.close(options);}
}
export class OverseerConsole extends SlotsApplication {
  static DEFAULT_OPTIONS={position:{width:1000,height:820},window:{title:"Goodneighbor · Overseer Console",resizable:true}};
  constructor(...args){super(...args);requireGM();this.filter="";this.category="";monitor=this;}
  async _renderHTML(){requireGM();const history=records();return monitorView({config:config(),cashierSelf:isCashier(),cashierName:cashier()?.name,
    records:history,pending:pendingUpdates(),events,filter:this.filter,category:this.category,
    players:playerRoster(history).map(u=>{const s=sessions.get(u.id)||{},actor=game.actors.get(s.actorId)||u.character;return {...s,id:u.id,name:u.name,active:u.active,actorName:actor?.name,balance:actor?.system?.currency?.caps,
      totals:playerTotals(history,u.id),net:playerTotals(history.filter(r=>r.at>=started),u.id).net};})});}
  _onRender(context,options){super._onRender(context,options);for(const key of ['filter','category'])this.element.querySelector(`[name=${key}]`).addEventListener('change',e=>{this[key]=e.target.value;this.render();});}
  async act(action,b){
    requireGM();
    if(action==='claim'){
      if(cashier()?.active && cashier()?.id!==game.user.id)throw Error("The current cashier is still connected. Have that GM disconnect before taking over.");
      await game.settings.set(ID,'cashier',game.user.id);await audit('Cashier assigned. Pending updates require review.');await publishJackpot();return refresh();
    }
    if(action==='pause')return updateConfig(c=>({...c,paused:!c.paused}),config().paused?'Wagers resumed':'New wagers paused');
    if(action==='block')return updateConfig(c=>({...c,blocked:c.blocked.includes(b.dataset.user)?c.blocked.filter(x=>x!==b.dataset.user):[...c.blocked,b.dataset.user]}),`Access changed for ${game.users.get(b.dataset.user)?.name}`);
    if(action==='configure')return configure();
    if(action==='prizes')return configurePrizes();
    if(action==='deliver'){
      requireCashier();const result=await transactions.deliverPrizes(b.dataset.actor,b.dataset.id);
      if(result.deliveryError)throw Error(result.deliveryError);
      await audit(`Prize delivery checked for ${result.actorName}: ${rewardText(result)}`,{actorId:result.actorId,spinId:result.id});refresh();return;
    }
    if(action==='share')return ChatMessage.create({content:'<h3>Goodneighbor Social Club</h3><p>Five reels. A little luck. Caps at the ready.</p><a class="gn-open-machine"><i class="fas fa-coins"></i> Open Goodneighbor Slots</a>'});
    if(action==='export'){
      const history=records();
      const data={schema:2,exportedAt:new Date().toISOString(),config:config(),transactions:history,jackpot:jackpotSummary(history),playerTotals:playerRoster(history).map(u=>({userId:u.id,name:u.name,...playerTotals(history,u.id)})),pending:pendingUpdates(),audit:game.users.contents.flatMap(u=>Object.values(u.getFlag(ID,'audit')||{}))};
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`goodneighbor-ledger-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(action==='inspect')return inspect(b.dataset.actor,b.dataset.id);
    if(action==='reconcile')return reconcile(b.dataset.gm,b.dataset.id);
  }
}
function updateConfig(fn,text){return adminQueue.run('config',async()=>{requireCashier();const c=validateConfig(fn(config()));await game.settings.set(ID,'machine',c);await audit(text,{config:c});refresh();});}
async function configure(){
  requireCashier();const c=config();
  const value=await DialogV2.prompt({window:{title:'Machine settings'},position:{width:660},content:`<p>Edit weights, wagers and item bundles. Changes apply to future spins. Item quantities do not scale with wagers; a single fixed wager is recommended.</p><textarea name="config" style="width:100%;height:400px;font-family:monospace">${esc(JSON.stringify(c,null,2))}</textarea>`,ok:{label:'Validate settings',callback:(_event,button)=>button.form.elements.config.value}});
  if(!value)return;const next=validateConfig(JSON.parse(value)),o=prizeOdds(next);
  const yes=await DialogV2.confirm({window:{title:'Apply machine settings'},content:`<p>Win chance: <b>${(100*o.hitRate).toFixed(2)}%</b>. Jackpot: ${(100*o.jackpotRate).toFixed(4)}%. Item values are not converted to a cap return percentage.</p><p>Apply to future spins?</p>`});
  if(yes)await updateConfig(()=>next,'Machine settings changed');
}
async function configurePrizes(){
  requireCashier();const c=config(),tiers=['common','rare','jackpot'];
  const rows=Object.fromEntries(tiers.map(t=>[t,[...c.prizes[t],...(c.prizes[t].length<10?[{name:'',uuid:'',quantity:1}]:[])]]));
  const content=`<p>Paste a world Item or compendium Item UUID to award a copy with its game statistics. Leave the UUID blank to create a named souvenir or voucher without automatic effects. Blank names are skipped; save and reopen to add another row.</p>${tiers.map(t=>`<fieldset><legend>${t.toUpperCase()} BUNDLE</legend>${rows[t].map((p,i)=>`<div style="display:grid;grid-template-columns:1fr 1fr 65px;gap:6px;margin:6px 0"><label>Prize name<input name="${t}_${i}_name" value="${esc(p.name)}" maxlength="100"></label><label>Item UUID<input name="${t}_${i}_uuid" value="${esc(p.uuid)}"></label><label>Quantity<input type="number" min="1" max="100" name="${t}_${i}_quantity" value="${p.quantity}"></label></div>`).join('')}</fieldset>`).join('')}`;
  const prizes=await DialogV2.prompt({window:{title:'Goodneighbor prize cabinet'},position:{width:760},content,ok:{label:'Save prizes',callback:(_event,b)=>{
    const fields=b.form.elements;return Object.fromEntries(tiers.map(t=>[t,rows[t].map((_,i)=>({name:fields[`${t}_${i}_name`].value.trim(),uuid:fields[`${t}_${i}_uuid`].value.trim(),quantity:Number(fields[`${t}_${i}_quantity`].value)})).filter(p=>p.name)]));
  }}});
  if(!prizes)return;
  validateConfig({...c,prizes});
  for(const bundle of Object.values(prizes))for(const p of bundle)if(p.uuid){const item=await fromUuid(p.uuid);if(item?.documentName!=='Item')throw Error(`Cannot find item: ${p.name}`);}
  await updateConfig(current=>({...current,prizes}),'Prize cabinet updated');
}
async function inspect(actorId,id){
  requireGM();const r=game.actors.get(actorId)?.getFlag(ID,`transactions.${id}`);if(!r)throw Error('No saved receipt found.');
  const content=`<pre style="white-space:pre-wrap;max-height:400px;overflow:auto">${esc(JSON.stringify(r,null,2))}</pre><p>Refund returns only the original wager; winnings remain. Each wager can be refunded once.</p>`;
  if(!isCashier()||r.practice||r.refund)return DialogV2.prompt({window:{title:'Spin receipt'},content,ok:{label:'Close'}});
  const reason=await DialogV2.wait({window:{title:'Spin receipt'},content:content+'<label>Refund reason<input name="reason" type="text" maxlength="500"></label>',buttons:[{action:'close',label:'Close',default:true},{action:'refund',label:`Refund ${r.wager} caps`,callback:(_e,b)=>b.form.elements.reason.value}],rejectClose:false});
  if(!reason||reason==='close')return;
  const next=await transactions.refund(actorId,id,reason);await audit(`Refunded ${next.wager} caps to ${next.actorName}: ${reason}`,{actorId,spinId:id});refresh();
}
async function reconcile(gmId,id){
  requireCashier();const owner=game.users.get(gmId),p=owner?.getFlag(ID,`pending.${id}`);if(!p)return;
  if(p.createdAt>=started)throw Error('Reload the world before reconciling this update, so the saved actor state is refreshed.');
  const actor=game.actors.get(p.actorId),saved=actor?.getFlag(ID,`transactions.${p.record.id}`);
  const committed=p.kind==='refund'?Boolean(saved?.refund):Boolean(saved);
  const ok=await DialogV2.confirm({window:{title:'Reconcile interrupted update'},content:`<p>Actor: <b>${esc(actor?.name||p.actorId)}</b>. Current caps: ${esc(actor?.system?.currency?.caps)}.</p><p>${committed?'A saved receipt confirms this update committed.':'No matching saved receipt. Reload Foundry and confirm the balance before clearing this hold.'}</p><pre style="white-space:pre-wrap;max-height:280px;overflow:auto">${esc(JSON.stringify(p.record,null,2))}</pre><p>Clear the hold without changing caps? If a manual correction is needed, make it on the actor sheet first.</p>`});
  if(!ok)return;
  await owner.unsetFlag(ID,`pending.${id}`);transactions.uncertain.delete(p.actorId);await audit(`Reconciled ${id}: ${committed?'receipt found':'GM reviewed; no saved receipt'}. No caps changed.`,{actorId:p.actorId,spinId:p.record.id});refresh();
}
export function openMachine(){if(!machine)machine=new SlotMachine();void machine.render({force:true});return machine;}
export function openMonitor(){requireGM();if(!monitor)monitor=new OverseerConsole();void monitor.render({force:true});return monitor;}
Hooks.once('init',()=>{
  game.settings.register(ID,'machine',{scope:'world',config:false,type:Object,default:DEFAULT_CONFIG,onChange:refresh});
  game.settings.register(ID,'cashier',{scope:'world',config:false,type:String,default:'',onChange:refresh});
  game.settings.register(ID,'jackpotBoard',{scope:'world',config:false,type:Object,default:{wins:0,spinsSince:0,lastWinner:null},onChange:refresh});
  game.settings.register(ID,'mute',{scope:'client',config:false,type:Boolean,default:false});
  game.settings.register(ID,'reduced',{scope:'client',config:false,type:Boolean,default:false});
  game.settings.registerMenu(ID,'play',{name:'Goodneighbor Slots',label:'Open slot machine',hint:'Five reels, caps, and Goodneighbor luck.',icon:'fas fa-coins',type:SlotMachine,restricted:false});
  game.settings.registerMenu(ID,'overseer',{name:'Goodneighbor Overseer',label:'Open live console',hint:'Assign a cashier, monitor players, and manage the machine.',icon:'fas fa-display',type:OverseerConsole,restricted:true});
});
Hooks.once('ready',()=>{
  transactions=new Transactions({config,actor:id=>game.actors.get(id),user:id=>id?game.users.get(id):game.user,authority:isCashier,
    random:()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296,resolvePrize:uuid=>fromUuid(uuid),
    begin:p=>game.user.setFlag(ID,`pending.${p.id}`,{...p,createdAt:Date.now()}),finish:id=>game.user.unsetFlag(ID,`pending.${id}`),blocked:id=>pendingUpdates().some(p=>p.actorId===id)});
  game.socket.on(channel,receive);
  game.modules.get(ID).api={open:openMachine,monitor:openMonitor,odds:()=>prizeOdds(config())};
  if(game.user.isGM){
    events.push(...game.users.contents.flatMap(u=>Object.values(u.getFlag(ID,'audit')||{})).sort((a,b)=>b.at-a.at).slice(0,100));
    if(pendingUpdates().length)ui.notifications.warn('Goodneighbor Slots: interrupted settlements need review in the Overseer console.');
    if(isCashier())void publishJackpot().catch(notifyError);
  }
});
Hooks.on('updateActor',()=>refresh());
Hooks.on('updateUser',()=>refresh());
Hooks.on('userConnected',(user,connected)=>{
  if(game.user.isGM)activity(`${connected?'Connected':'Disconnected'}${!connected?' · accepted spins still settle':''}`,'session',{userId:user.id,userName:user.name});refresh();
});
Hooks.on('renderChatMessageHTML',(_message,html)=>{html.querySelectorAll('.gn-open-machine').forEach(el=>el.addEventListener('click',()=>openMachine()));});
