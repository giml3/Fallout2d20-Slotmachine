import {test} from 'node:test';
import assert from 'node:assert/strict';
import {machineView,monitorView} from '../scripts/views.js';
import {DEFAULT_CONFIG} from '../scripts/engine.js';
test('machine renders five reels and escapes user-controlled labels',()=>{
  const html=machineView({config:{...DEFAULT_CONFIG,name:'<img onerror="bad">'},actors:[{id:'a',name:'<script>bad</script>'}],actorId:'a',wager:5,connected:true});
  assert.equal((html.match(/class="gn-reel"/g)||[]).length,5);
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img onerror'));assert.ok(html.includes('RARE ITEM BUNDLE'));assert.ok(!html.includes('theoretical return'));
});
test('console shows six player cards and escapes live activity',()=>{
  const html=monitorView({config:DEFAULT_CONFIG,players:Array.from({length:6},(_,i)=>({id:i,name:`Player ${i}`,net:0})),events:[{at:0,text:'<script>bad</script>',category:'session'}],records:[],pending:[]});
  assert.equal((html.match(/<article /g)||[]).length,6);assert.ok(!html.includes('<script>'));
});
