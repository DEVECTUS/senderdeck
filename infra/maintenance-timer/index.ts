const ENDPOINT="https://senderdeck.devectus.com.au/api/social/maintenance/cloud";
type TimerEnv={MAINTENANCE_TOKEN?:string};

// The timer holds only a dedicated maintenance key, never customer/provider tokens.
export async function tick(env:TimerEnv, fetcher:typeof fetch=fetch, wait:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  if(!env.MAINTENANCE_TOKEN)throw new Error("Maintenance timer secret is missing.");
  const deadline=Date.now()+240000;
  for(let attempt=0;attempt<3;attempt++) {
    const remaining=deadline-Date.now();
    if(remaining<=0)throw new Error("Maintenance completion is uncertain.");
    const signal=AbortSignal.timeout(remaining);
    let response:Response;
    try {
      response=await fetcher(ENDPOINT,{method:"POST",headers:{authorization:`Bearer ${env.MAINTENANCE_TOKEN}`},redirect:"manual",signal});
    } catch {
      // Do not resubmit after a network error: hosted work may already be running.
      throw new Error("Maintenance completion is uncertain.");
    }
    if(response.ok) {
      let receipt:{processed?:boolean;reconciled?:number;at?:string;source?:string};
      try { receipt=await response.json(); } catch { throw new Error("Maintenance completion is uncertain."); }
      if(receipt.processed!==true || !Number.isInteger(receipt.reconciled) || !Number.isFinite(Date.parse(receipt.at||"")) || receipt.source!=="cloud_cron") throw new Error("Maintenance receipt is invalid.");
      return {processed:true,at:receipt.at};
    }
    await response.body?.cancel().catch(()=>{});
    if(response.status===409 && response.headers.get("x-senderdeck-maintenance-state")==="busy" && attempt<2) {
      await wait(30000*(attempt+1));
      continue;
    }
    throw new Error(`Maintenance returned HTTP ${response.status}.`);
  }
  throw new Error("Maintenance did not complete.");
}

export default {
  async fetch() { return new Response("Not found.",{status:404}); },
  async scheduled(_event:unknown,env:TimerEnv,ctx:{waitUntil(promise:Promise<unknown>):void}) {
    ctx.waitUntil(tick(env).then(receipt=>console.log(JSON.stringify(receipt))));
  },
};
