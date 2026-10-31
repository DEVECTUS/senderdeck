import assert from "node:assert/strict";
import test from "node:test";
import timer,{tick} from "../infra/maintenance-timer/index";

const success=()=>Response.json({processed:true,reconciled:0,at:"2026-10-31T00:00:00Z",source:"cloud_cron",private:"not returned"});
test("cloud timer targets only the fixed protected endpoint and returns minimal completion",async()=>{
  let calls=0;
  const receipt=await tick({MAINTENANCE_TOKEN:"synthetic"},async(input,init)=>{
    calls++;assert.equal(String(input),"https://senderdeck.devectus.com.au/api/social/maintenance/cloud");
    assert.equal(init!.method,"POST");assert.equal(init!.redirect,"manual");assert.equal(new Headers(init!.headers).get("authorization"),"Bearer synthetic");
    return success();
  });
  assert.equal(calls,1);assert.deepEqual(receipt,{processed:true,at:"2026-10-31T00:00:00Z"});
  await assert.rejects(tick({},async()=>{throw new Error("must not call");}),/secret is missing/);
  assert.equal((await timer.fetch()).status,404);
});
test("cloud timer retries only marked lease contention and never treats busy as completion",async()=>{
  let calls=0;const waits:number[]=[];
  await tick({MAINTENANCE_TOKEN:"synthetic"},async()=>++calls<3?new Response(null,{status:409,headers:{"x-senderdeck-maintenance-state":"busy"}}):success(),async ms=>{waits.push(ms);});
  assert.equal(calls,3);assert.deepEqual(waits,[30000,60000]);
  calls=0;
  await assert.rejects(tick({MAINTENANCE_TOKEN:"synthetic"},async()=>{calls++;return new Response(null,{status:409,headers:{"x-senderdeck-maintenance-state":"busy"}});},async()=>{}),/HTTP 409/);
  assert.equal(calls,3);
});
test("cloud timer refuses redirects, errors and uncertain completions without leaking content",async()=>{
  for(const response of [new Response(null,{status:307,headers:{location:"https://untrusted.example"}}),new Response("private token",{status:401}),new Response(null,{status:409}),new Response(null,{status:503}),new Response("not JSON"),Response.json({processed:true,at:"invalid",source:"cloud_cron"}),Response.json({processed:true,reconciled:0,at:"2026-10-31",source:"operator"})]) {
    let calls=0;
    await assert.rejects(tick({MAINTENANCE_TOKEN:"synthetic"},async()=>{calls++;return response;},async()=>{throw new Error("must not wait");}),/^Error: Maintenance (returned HTTP \d+|completion is uncertain|receipt is invalid)\.$/);
    assert.equal(calls,1);
  }
  let calls=0;
  await assert.rejects(tick({MAINTENANCE_TOKEN:"synthetic"},async()=>{calls++;throw new Error("private provider details");}),/^Error: Maintenance completion is uncertain\.$/);
  assert.equal(calls,1);
});
test("scheduled handler retains completion promise and propagates failure",async()=>{
  let work:Promise<unknown>|undefined;
  await timer.scheduled({}, {}, {waitUntil(p){work=p;}});
  await assert.rejects(work!,/secret is missing/);
});
