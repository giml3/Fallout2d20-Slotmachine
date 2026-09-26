import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareAwards} from '../scripts/prizes.js';
test('configured compendium prizes snapshot stats and override only quantity/equipment/identity',async()=>{
  const source={_id:'original',name:'Laser pistol',type:'weapon',folder:'folder',system:{quantity:1,damage:{rating:4},equipped:true},flags:{other:{a:1}}};
  const awards=await prepareAwards([{name:'Jackpot gun',uuid:'Compendium.test.items.Item.foo',quantity:2}],'spin-id',{
    resolve:async()=>({documentName:'Item',toObject:()=>structuredClone(source)}),makeId:()=> 'newitemid12345678'
  });
  assert.equal(awards[0].data._id,'newitemid12345678');assert.equal(awards[0].name,'Laser pistol');assert.equal(awards[0].data.system.quantity,2);
  assert.equal(awards[0].data.system.damage.rating,4);assert.equal(awards[0].data.system.equipped,false);assert.equal(awards[0].data.folder,undefined);
  assert.equal(source.system.quantity,1);
});
