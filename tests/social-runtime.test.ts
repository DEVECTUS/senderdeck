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
  await assert.rejects(runMaintenance("token",async()=>{throw new Error("token and request headers must remain hidden");}),/^Error: The maintenance endpoint could not be reached\.$/);
});
