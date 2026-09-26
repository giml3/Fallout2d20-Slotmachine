import {symbol} from './views.js';

// Presentation-only randomness: these schedules never select or change prizes.
export function reelPlan(random=Math.random){
  const cruise=650+random()*650, brake=1800+random()*2000;
  const steps=22+Math.floor(random()*18);
  return {cruise,brake,steps,speed:steps/(cruise+brake/4)};
}
export function reelPosition(elapsed,plan){
  if(elapsed<=0)return 0;
  if(elapsed<plan.cruise)return elapsed*plan.speed;
  const t=Math.min(1,(elapsed-plan.cruise)/plan.brake);
  return t===1?plan.steps:plan.speed*(plan.cruise+plan.brake/4*(1-(1-t)**4));
}
export async function animateReels(root,results,symbols,{reduced=()=>false,onStop=()=>{},random=Math.random}={}){
  const reels=[...(root?.querySelectorAll('.gn-reel')||[])];
  const instant=()=>reduced()||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  root?.querySelector('.gn-reels')?.classList.remove('is-spinning');
  await Promise.all(reels.map((reel,index)=>new Promise(resolve=>{
    const target=results[index];
    if(!target){resolve();return;}
    const finish=()=>{
      if(reel.isConnected){reel.innerHTML=symbol(target,true,symbols);reel.classList.remove('gn-rolling');reel.dataset.stopped='true';}
      try{onStop(index);}catch{/* Audio must never interrupt a settled spin. */}
      resolve();
    };
    if(instant()||!reel.isConnected){finish();return;}
    const plan=reelPlan(random);
    const sequence=Array.from({length:plan.steps+2},()=>symbols[Math.floor(random()*symbols.length)].id);
    sequence[plan.steps]=target;
    reel.classList.add('gn-rolling');reel.dataset.stopped='false';
    reel.innerHTML='<div class="gn-reel-strip" aria-hidden="true"></div>';
    const strip=reel.firstElementChild;
    let previous=-1;const start=performance.now();
    const frame=now=>{
      if(!reel.isConnected||instant()||now-start>=plan.cruise+plan.brake){finish();return;}
      const position=reelPosition(now-start,plan),step=Math.floor(position),fraction=position-step;
      const height=reel.clientHeight;
      if(step!==previous){
        strip.innerHTML=[sequence[step+1],sequence[step],sequence[Math.max(0,step-1)]].map(id=>`<div class="gn-reel-cell">${symbol(id,true,symbols)}</div>`).join('');
        previous=step;
      }
      strip.style.setProperty('--cell-height',`${height}px`);
      strip.style.transform=`translate3d(0,${(fraction-1)*height}px,0)`;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  })));
}
