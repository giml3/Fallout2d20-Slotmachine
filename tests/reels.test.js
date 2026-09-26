import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reelPlan,reelPosition} from '../scripts/reels.js';
test('reel motion cruises then continuously slows to an exact stop',()=>{
  const p=reelPlan(()=>.5),dt=10;
  assert.equal(reelPosition(0,p),0);
  assert.equal(reelPosition(p.cruise+p.brake,p),p.steps);
  assert.equal(reelPosition(100000,p),p.steps);
  const speed=t=>(reelPosition(t+dt,p)-reelPosition(t,p))/dt;
  assert.ok(Math.abs(speed(0)-speed(100))<1e-10);
  assert.ok(speed(p.cruise+100)>speed(p.cruise+p.brake/2));
  assert.ok(speed(p.cruise+p.brake/2)>speed(p.cruise+p.brake-20));
  let prev=0;for(let t=0;t<p.cruise+p.brake;t+=17){const next=reelPosition(t,p);assert.ok(next>=prev&&next<=p.steps);prev=next;}
});
test('random schedules vary timing and travel without affecting outcome',()=>{
  const early=reelPlan(()=>0),late=reelPlan(()=>.999);
  assert.ok(early.cruise+early.brake<late.cruise+late.brake);
  assert.notEqual(early.steps,late.steps);
  assert.ok(late.cruise+late.brake<5100);
});
