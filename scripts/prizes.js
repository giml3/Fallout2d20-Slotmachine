import {ID} from './engine.js';

export async function prepareAwards(prizes,spinId,{resolve=async()=>null,makeId=()=>crypto.randomUUID().replaceAll('-','').slice(0,16)}={}) {
  const awards=[];
  for(const prize of prizes){
    let data;
    if(prize.uuid){
      const source=await resolve(prize.uuid);
      if(!source||source.documentName!=='Item')throw Error(`Prize item unavailable: ${prize.name}. Ask the GM to fix its UUID.`);
      data=source.toObject();
      delete data._id;delete data.folder;delete data.ownership;delete data._stats;delete data.sort;
    }else data={name:prize.name,type:'miscellany',img:'icons/svg/item-bag.svg',system:{description:'An original Goodneighbor Social Club prize. Souvenirs and service vouchers have no automatic rules effects.',weight:0,cost:0}};
    data._id=makeId();data.system={...data.system,quantity:prize.quantity,equipped:false,stashed:false};
    data.flags={...data.flags,[ID]:{spinId,prizeId:data._id}};
    awards.push({id:data._id,name:data.name,quantity:prize.quantity,uuid:prize.uuid,data});
  }
  return awards;
}

// IDs and item snapshots are saved with the financial receipt before creation.
// Retrying a delivery reuses those IDs and only creates missing embedded items.
export async function deliverAwards(actor,record) {
  if(record.practice||!record.awards?.length||record.delivery==='delivered')return record;
  for(const a of record.awards){
    const existing=actor.items.get(a.id);
    if(existing){
      if(existing.getFlag(ID,'spinId')!==record.id)throw Error(`Inventory ID conflict for ${a.name}; GM review required.`);
      continue;
    }
    await actor.createEmbeddedDocuments('Item',[structuredClone(a.data)],{keepId:true});
    if(actor.items.get(a.id)?.getFlag(ID,'spinId')!==record.id)throw Error(`Could not confirm delivery of ${a.name}.`);
  }
  const next={...record,delivery:'delivered',deliveredAt:Date.now()};
  await actor.update({[`flags.${ID}.transactions.${record.id}`]:next});
  return next;
}
