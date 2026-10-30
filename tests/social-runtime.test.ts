import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { runMaintenance } from "../scripts/run-social-maintenance.mjs";

test("Meta Graph requests work in the actual Worker runtime and never follow redirects",async()=>{
  const bundled=await build({entryPoints:["worker/social/meta.ts"],bundle:true,format:"iife",globalName:"metaTest",platform:"browser",write:false});
  let redirect=false,calls=0;
  const mf=new Miniflare({modules:true,compatibilityDate:"2026-05-01",script:bundled.outputFiles[0].text+`
    export default {async fetch(){try{return Response.json(await metaTest.graph('synthetic-runtime-token','platform',{fields:'id,name'}));}catch(error){return Response.json({error:error.message},{status:error.status||500});}}};`,
    outboundService:async (request:Request)=>{calls++;assert.equal(new URL(request.url).origin,"https://graph.facebook.com");assert.equal(request.headers.get("authorization"),"Bearer synthetic-runtime-token");return redirect?new Response(null,{status:307,headers:{location:"https://untrusted.example/token-capture"}}):Response.json({id:"platform",name:"Synthetic app"});}});
  try{
    const response=await mf.dispatchFetch("https://worker.test/");assert.equal(response.status,200);assert.equal((await response.json() as {id:string}).id,"platform");assert.equal(calls,1);
    redirect=true;const rejected=await mf.dispatchFetch("https://worker.test/");assert.equal(rejected.status,502);assert.match(await rejected.text(),/not followed/);assert.equal(calls,2);
  }finally{await mf.dispose();}
});
test("hosted updater authenticates only to the fixed endpoint and returns minimal completion data",async()=>{
  let calls=0;
  const result=await runMaintenance("synthetic-maintenance-token",async(input,init)=>{
    calls++;assert.equal(String(input),"https://senderdeck.devectus.com.au/api/social/maintenance");assert.equal(init?.method,"POST");assert.equal(init?.redirect,"manual");assert.equal(new Headers(init?.headers).get("authorization"),"Bearer synthetic-maintenance-token");
    return Response.json({processed:true,reconciled:0,at:new Date().toISOString(),privateField:"must-not-return"});
  });
  assert.equal(calls,1);assert.equal(result.processed,true);assert.ok(!JSON.stringify(result).includes("privateField"));
  await assert.rejects(runMaintenance(undefined),/not configured/);
});
test("hosted updater rejects redirects and malformed completion without reflecting provider content",async()=>{
  await assert.rejects(runMaintenance("token",async()=>new Response("secret-response-body",{status:302,headers:{location:"https://untrusted.example/"}})),/^Error: The maintenance endpoint returned HTTP 302\.$/);
  await assert.rejects(runMaintenance("token",async()=>Response.json({processed:false})),/did not confirm/);
  await assert.rejects(runMaintenance("token",async()=>{throw new Error("token and request headers must remain hidden");},async()=>{}),/^Error: The maintenance endpoint could not be reached\.$/);
});

test("hosted updater retries temporary gateway failures with bounded backoff and fresh deadlines",async()=>{
  const waits:number[]=[],signals:AbortSignal[]=[],sources:(string|null)[]=[];
  let calls=0;
  const result=await runMaintenance("synthetic-token",async(input,init)=>{
    assert.equal(String(input),"https://senderdeck.devectus.com.au/api/social/maintenance");
    assert.equal(init?.redirect,"manual");assert.equal(init?.method,"POST");
    assert.equal(new Headers(init?.headers).get("authorization"),"Bearer synthetic-token");
    sources.push(new Headers(init?.headers).get("x-senderdeck-maintenance-source"));
    signals.push(init!.signal!);
    calls++;
    return calls<3?new Response("private upstream body",{status:calls===1?503:504}):Response.json({processed:true,reconciled:2,at:"2026-10-28T00:00:00Z",privateField:"hidden"});
  },async ms=>{waits.push(ms);});
  assert.deepEqual(waits,[5000,10000]);assert.equal(calls,3);
  assert.equal(new Set(signals).size,3);assert.equal(new Set(sources).size,1);
  assert.deepEqual(result,{processed:true,reconciled:2,at:"2026-10-28T00:00:00Z"});
});

test("hosted updater recovers from network errors and stops after three failed attempts",async()=>{
  let calls=0;
  await runMaintenance("token",async()=>{
    if(++calls===1)throw new Error("private network details");
    return Response.json({processed:true,reconciled:0,at:new Date().toISOString()});
  },async()=>{});
  assert.equal(calls,2);
  for(const status of [502,503,504]){
    calls=0;const waits:number[]=[];
    await assert.rejects(runMaintenance("token",async()=>{calls++;return new Response("private body",{status});},async ms=>{waits.push(ms);}),new RegExp(`^Error: The maintenance endpoint returned HTTP ${status}\\.$`));
    assert.equal(calls,3);assert.deepEqual(waits,[5000,10000]);
  }
  calls=0;
  await assert.rejects(runMaintenance("token",async()=>{calls++;throw new Error("private details");},async()=>{}),/^Error: The maintenance endpoint could not be reached\.$/);
  assert.equal(calls,3);
});

test("hosted updater never retries authentication, overlap, redirects or invalid completion",async()=>{
  for(const response of [
    new Response("private",{status:401}),new Response("private",{status:403}),
    new Response("private",{status:409}),new Response("private",{status:500}),
    new Response(null,{status:307,headers:{location:"https://untrusted.example/"}}),
    new Response("not JSON"),Response.json({processed:false}),
  ]){
    let calls=0,waits=0;
    await assert.rejects(runMaintenance("token",async()=>{calls++;return response;},async()=>{waits++;}),/The maintenance endpoint (returned HTTP \d+|did not confirm completion)\./);
    assert.equal(calls,1);assert.equal(waits,0);
  }
});

test("hosted updater never retries after its deadline leaves completion uncertain",async()=>{
  const originalTimeout = AbortSignal.timeout;
  let calls = 0, waits = 0;
  AbortSignal.timeout = () => AbortSignal.abort();
  try {
    await assert.rejects(runMaintenance("token",async(_input,init)=>{
      calls++;
      init!.signal!.throwIfAborted();
      throw new Error("unreachable");
    },async()=>{waits++;}),/^Error: The maintenance endpoint did not confirm completion\.$/);
    assert.equal(calls,1);assert.equal(waits,0);
  } finally { AbortSignal.timeout = originalTimeout; }
});
