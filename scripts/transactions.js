import { ID, CAPS, KeyedQueue, safeBalance, spin, rewardFor } from "./engine.js";
import {prepareAwards,deliverAwards} from './prizes.js';

// One update contains both the new balance and its durable receipt. No separate
// debit/payout stage can be replayed after a client closes or loses a response.
export class Transactions {
  constructor({ config, actor, user, random, authority = () => true, now = Date.now,
    begin = async () => {}, finish = async () => {}, blocked = () => false, resolvePrize, makeId }) {
    Object.assign(this,{config,actor,user,random,authority,now,begin,finish,blocked,resolvePrize,makeId});
    this.queue=new KeyedQueue();
    this.uncertain=new Set();
  }
  play(req) {
    return this.queue.run(req.actorId, async () => {
      if(!this.authority()) throw Error("The assigned cashier GM is not connected.");
      if(typeof req.id !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(req.id)) throw Error("Invalid spin ID.");
      const actor=this.actor(req.actorId), user=this.user(req.userId);
      if(!actor || !user?.active || !actor.testUserPermission(user,"OWNER")) throw Error("Choose a character you own.");
      const prior=actor.getFlag(ID,`transactions.${req.id}`);
      if(prior) {
        if(prior.userId!==req.userId || prior.wager!==req.wager) throw Error("Spin ID already used.");
        const recovered=this.blocked(actor.id)?prior:await this.deliver(actor,prior);
        return {...recovered, replay:true};
      }
      if(this.uncertain.has(actor.id) || this.blocked(actor.id)) throw Error("This character has an uncertain update. The GM must reconcile it first.");
      const c=this.config();
      if(c.paused) throw Error("The machine is paused.");
      if(c.blocked.includes(user.id)) throw Error("The GM has disabled your access.");
      if(!c.wagers.includes(req.wager)) throw Error("This wager is not available.");
      const before=safeBalance(actor.system?.currency?.caps);
      if(!c.practice && before<req.wager) throw Error("Not enough caps for this wager.");
      const rolled=spin(c,this.random), reward=rewardFor(rolled,c), result={...rolled,...reward};
      const payout=req.wager*reward.multiplier;
      const awards=await prepareAwards(reward.prizes,req.id,{resolve:this.resolvePrize,makeId:this.makeId});
      const after=safeBalance(c.practice ? before : before-req.wager+payout);
      const record={id:req.id,actorId:actor.id,actorName:actor.name,userId:user.id,userName:user.name,
        wager:req.wager,payout,before,after,net:c.practice?0:payout-req.wager,practice:c.practice,
        ...result,awards,delivery:c.practice?'practice':awards.length?'pending':'none',schema:2,
        at:this.now(),status:"settled",machine:c.name,gmId:this.user().id};
      await this.begin({id:req.id,actorId:actor.id,kind:"spin",record});
      if(!this.authority()) throw Error("Cashier changed during settlement. GM review required.");
      try {
        await actor.update({[CAPS]:after,[`flags.${ID}.transactions.${req.id}`]:record});
      } catch(error) {
        this.uncertain.add(actor.id);
        throw Error(`Settlement uncertain; GM review required. ${error.message}`);
      }
      await this.finish(req.id).catch(() => {});
      return this.blocked(actor.id)?record:await this.deliver(actor,record);
    });
  }
  async deliver(actor,record){
    if(!this.authority())return {...record,deliveryError:'Cashier disconnected. Use Deliver prizes after reconnecting.'};
    try{return await deliverAwards(actor,record);}
    catch(error){return {...record,deliveryError:error.message};}
  }
  deliverPrizes(actorId,id){
    return this.queue.run(actorId,async()=>{
      if(!this.authority()||!this.user()?.isGM)throw Error('Only the cashier GM can deliver prizes.');
      if(this.blocked(actorId)||this.uncertain.has(actorId))throw Error('Reconcile the interrupted cap update first.');
      const actor=this.actor(actorId),record=actor?.getFlag(ID,`transactions.${id}`);
      if(!record)throw Error('No saved prize receipt.');
      return this.deliver(actor,record);
    });
  }
  refund(actorId,id,reason) {
    return this.queue.run(actorId,async () => {
      if(!this.authority() || !this.user()?.isGM) throw Error("Only the assigned cashier GM can refund.");
      if(!reason?.trim()) throw Error("A refund reason is required.");
      const actor=this.actor(actorId), r=actor?.getFlag(ID,`transactions.${id}`);
      if(!r || r.practice) throw Error("No real-cap transaction to refund.");
      if(r.refund) return r;
      if(this.uncertain.has(actorId) || this.blocked(actorId)) throw Error("Reconcile this character before refunding.");
      const before=safeBalance(actor.system.currency.caps), after=safeBalance(before+r.wager);
      const next={...r,refund:{amount:r.wager,before,after,at:this.now(),gmId:this.user().id,reason:reason.trim().slice(0,500)}};
      await this.begin({id:`refund_${id}`,actorId,kind:"refund",record:next});
      if(!this.authority()) throw Error("Cashier changed during refund. GM review required.");
      try {await actor.update({[CAPS]:after,[`flags.${ID}.transactions.${id}`]:next});}
      catch(error) {this.uncertain.add(actorId); throw Error(`Refund uncertain; GM review required. ${error.message}`);}
      await this.finish(`refund_${id}`).catch(() => {});
      return next;
    });
  }
}
