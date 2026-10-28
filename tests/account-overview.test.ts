import assert from "node:assert/strict";
import test from "node:test";
import { loadAccountOverview } from "../app/account-overview-data";

test("overview reads only authorised brands and avoids counting linked mailboxes twice", async () => {
  const actions: string[] = [];
  const request = (async (url: string, init: RequestInit) => {
    assert.equal(init.cache, "no-store");
    if (url === "/api/accounts") return Response.json({ accounts: [{ id: "mail", provider: "microsoft", email: "owner@example.test" }] });
    const { action, args } = JSON.parse(String(init.body)); actions.push(action);
    if (action === "social_workspace_list") return Response.json({ customers: [], brands: [{ id: "allowed", name: "Example brand", customer_id: "customer" }] });
    assert.equal(action, "social_account_list"); assert.deepEqual(args, { brandId: "allowed" });
    return Response.json({ accounts: [{ id: "linked", provider: "email", name: "Mailbox" }, { id: "page", provider: "facebook", name: "Example Page", status: "limited", capabilities: {} }] });
  }) as typeof fetch;
  const result = await loadAccountOverview(new AbortController().signal, request);
  assert.equal(result.emails.length, 1); assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].brand.id, "allowed"); assert.equal(result.accounts[0].status, "limited");
  assert.deepEqual(actions, ["social_workspace_list", "social_account_list"]);
  assert.equal(result.emailAvailable, true); assert.equal(result.socialComplete, true); assert.deepEqual(result.errors, []);
});

test("overview preserves successful connections and reports partial failures without a false zero", async () => {
  const request = (async (url: string, init: RequestInit) => {
    if (url === "/api/accounts") return new Response(null, { status: 401 });
    const { action, args } = JSON.parse(String(init.body));
    if (action === "social_workspace_list") return Response.json({ customers: [], brands: [{ id: "good", name: "Good brand" }, { id: "failed", name: "Unavailable brand" }] });
    if (args.brandId === "failed") return new Response(null, { status: 503 });
    return Response.json({ accounts: [{ id: "page", provider: "facebook", name: "Example Page" }] });
  }) as typeof fetch;
  const result = await loadAccountOverview(new AbortController().signal, request);
  assert.equal(result.emailAvailable, false); assert.equal(result.socialComplete, false);
  assert.equal(result.accounts.length, 1); assert.equal(result.workspace?.brands.length, 2);
  assert.equal(result.errors.length, 2); assert.match(result.errors.join(" "), /Unavailable brand/);
  assert.deepEqual(result.failedBrandIds, ["failed"]);
});


test("out-of-order brand responses retain their own identity and validation evidence",async()=>{
  let release!: (response:Response)=>void;
  const slow=new Promise<Response>(resolve=>{release=resolve;});
  const request=(async(url:string,init:RequestInit)=>{
    if(url==="/api/accounts")return Response.json({accounts:[]});
    const {action,args}=JSON.parse(String(init.body));
    if(action==="social_workspace_list")return Response.json({customers:[],brands:[{id:"old",name:"Old checks"},{id:"new",name:"New checks"}]});
    if(args.brandId==="old")return slow;
    release(Response.json({accounts:[{id:"old-page",name:"Same name",provider:"facebook",status:"connected",capabilities:{needsValidation:true,lastValidatedAt:1,messageBlockers:["live_history_validation_required"]}}]}));
    return Response.json({accounts:[{id:"new-page",name:"Same name",provider:"facebook",status:"connected",capabilities:{needsValidation:false,lastValidatedAt:2,messages:"available",comments:"available"}}]});
  }) as typeof fetch;
  const result=await loadAccountOverview(new AbortController().signal,request);
  assert.equal(result.accounts.find(a=>a.id==="old-page")?.brand.id,"old");assert.equal(result.accounts.find(a=>a.id==="new-page")?.brand.id,"new");
  assert.equal(result.accounts.find(a=>a.id==="old-page")?.capabilities.needsValidation,true);assert.equal(result.accounts.find(a=>a.id==="new-page")?.capabilities.needsValidation,false);
});
