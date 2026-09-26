import {DEFAULT_CONFIG,spin,rewardFor,playerTotals,jackpotSummary} from '../scripts/engine.js';
import {machineView,monitorView,rewardText} from '../scripts/views.js';
import {animateReels} from '../scripts/reels.js';
const actors=['Charlie','Mags','Deacon','Gloria','Nick','Rose'].map((name,i)=>({id:`a${i}`,name,balance:250+i*40}));
const players=actors.map((a,i)=>({id:`p${i}`,name:`Player ${i+1}`,active:true,actorName:a.name,balance:a.balance,wager:5,net:0,status:i===2?'Reels spinning':'At the machine'}));
const config=structuredClone(DEFAULT_CONFIG),events=[{at:Date.now(),userName:'Overseer',text:'Goodneighbor Social Club is open. Six players connected.',category:'admin'}];
let mode='machine',filter='',category='';const records=[];const state={config,actors,actorId:'a0',balance:250,wager:5,connected:true,isGM:true,mute:true,paytableOpen:true};
const main=document.querySelector('main');
function render(){state.jackpot=jackpotSummary(records);for(const p of players)p.totals=playerTotals(records,p.id);main.classList.toggle('monitor',mode==='monitor');main.innerHTML=mode==='machine'?machineView(state):monitorView({config,players,events,records,pending:[],filter,category,cashierSelf:true,cashierName:'Overseer'});}
const demoJackpot=document.createElement('button');demoJackpot.textContent='Demo jackpot';document.querySelector('nav').append(demoJackpot);
demoJackpot.addEventListener('click',()=>runDemo(true));
document.querySelector('#machine').onclick=()=>{mode='machine';render();};document.querySelector('#monitor').onclick=()=>{mode='monitor';render();};
main.addEventListener('change',e=>{if(e.target.name==='actor'){state.actorId=e.target.value;state.balance=actors.find(a=>a.id===state.actorId)?.balance;render();}if(e.target.name==='motion'){state.reduced=e.target.checked;main.classList.toggle('gn-reduced',e.target.checked);}if(e.target.name==='filter'){filter=e.target.value;render();}if(e.target.name==='category'){category=e.target.value;render();}});
main.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.action==='monitor'){mode='monitor';render();}
  if(b.dataset.action==='wager'){state.wager=Number(b.dataset.wager);render();}
  if(b.dataset.action==='pause'){config.paused=!config.paused;render();}
  if(b.dataset.action==='block'){config.blocked=config.blocked.includes(b.dataset.user)?config.blocked.filter(x=>x!==b.dataset.user):[...config.blocked,b.dataset.user];render();}
  if(['claim','configure','prizes','share','export','inspect'].includes(b.dataset.action)){events.unshift({at:Date.now(),userName:'Demo',text:'This administrative action is available in the installed Foundry module.',category:'admin'});render();}
  if(b.dataset.action==='spin')await runDemo(false);
});
async function runDemo(jackpot){
    if(state.busy||config.paused)return;
    const a=actors.find(a=>a.id===state.actorId),p=players[actors.indexOf(a)];
    if(!a||a.balance<state.wager||config.blocked.includes(p.id)){state.message='Not enough caps, or access blocked by the Overseer.';render();return;}
    mode='machine';
    state.busy=true;state.message='The reels are rolling…';render();
    const forced={reels:Array(5).fill('people'),count:5};
    const r=jackpot?{...forced,...rewardFor(forced,config)}:spin(config),before=a.balance,net=state.wager*(r.multiplier-1);
    await animateReels(main,r.reels,config.symbols,{reduced:()=>state.reduced});
    state.reels=r.reels;a.balance+=net;state.balance=a.balance;p.balance=a.balance;p.net+=net;p.wager=state.wager;p.status=r.jackpot?'Jackpot!':'Spin settled';state.busy=false;
    const record={...r,schema:2,awards:r.prizes,delivery:r.prizes.length?'delivered':'none',id:crypto.randomUUID(),actorId:a.id,actorName:a.name,userId:p.id,userName:p.name,at:Date.now(),wager:state.wager,payout:state.wager*r.multiplier,before,after:a.balance,net};records.unshift(record);
    state.message=rewardText(record);
    events.unshift({at:record.at,userId:p.id,userName:a.name,text:`${state.wager} cap wager → ${rewardText(record)} · balance ${a.balance}`,category:r.jackpot?'jackpot':'transaction'});render();
}
render();
