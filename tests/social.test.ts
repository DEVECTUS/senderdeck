import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { socialAction, readThread } from "../worker/social/service";
import { defaultProfile, assess, validateProfile } from "../worker/social/policy";
import { accountFor, brandFor, notice, safeAccount, maintenanceStatus, type SocialAccount, type Thread, type History } from "../worker/social/model";
import { graphPages, readHistory, platformStatus, capabilities, discover, validateConnection, inbox } from "../worker/social/meta";
import { startOAuth, oauthCallback, grantAssets, selectAsset, selectAdvertisingAccount } from "../worker/social/oauth";
import { hmac, receiveMeta, processQueue, maintenance, runHostedMaintenance, verifySignedRequest, metaDeletion } from "../worker/social/webhooks";
import { handleSocial } from "../worker/social/api";
import { customerSetup, operatorSetup, checkOperatorApp } from "../worker/social/setup";
import { encrypt, decrypt, sha256Base64Url } from "../worker/crypto";
import { resolveMetaSecrets } from "../worker/social/config";
import { ensureWebhookToken } from "../worker/social/webhook-setup";
import { accountMonitoring, monitoringEvidence, recordDelivery, recordPoll } from "../worker/social/monitoring";
import type { D1PreparedStatement, WorkerD1Database, Env } from "../worker/env";

function database() {
  const sql = new DatabaseSync(":memory:"); sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(f=>f.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  const wrap = (query:string, values:unknown[]=[]):D1PreparedStatement => ({
    bind: (...args:unknown[])=>wrap(query,args),
    async first<T>() { return (sql.prepare(query).get(...values as never[]) as T)||null; },
    async all<T>() { return {success:true,results:sql.prepare(query).all(...values as never[]) as T[]}; },
    async run<T>() { const result=sql.prepare(query).run(...values as never[]); return {success:true,results:[] as T[],meta:{changes:result.changes}}; },
  });
  const DB:WorkerD1Database={prepare:wrap,async batch<T>(statements:D1PreparedStatement[]) {sql.exec("BEGIN");try{const results=[];for(const s of statements)results.push(await s.all<T>());sql.exec("COMMIT");return results;}catch(e){sql.exec("ROLLBACK");throw e;}}};
  return {sql,DB};
}
const scopes=["pages_show_list","pages_read_engagement","pages_read_user_content","pages_manage_metadata","pages_messaging","pages_manage_engagement","instagram_basic","instagram_manage_messages","instagram_manage_comments"];
async function fixture() {
  const {sql,DB}=database();
  const env:Env={DB,TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,9).toString("base64"),ALLOW_DEV_AUTH:"true",META_APP_ID:"platform",META_APP_SECRET:"app-secret",META_LOGIN_CONFIG_ID:"login-config",META_WEBHOOK_VERIFY_TOKEN:"verify-secret",META_ACCESS_TIER:"advanced",SOCIAL_PUBLIC_ORIGIN:"https://senderdeck.test",SOCIAL_SEND_ENABLED:"true",SOCIAL_SCHEDULER_ENABLED:"true"};
  const customer=await socialAction("social_customer_create",{name:"Customer A"},env,"alice") as {customerId:string};
  const created=await socialAction("social_brand_create",{customerId:customer.customerId,name:"Brand A"},env,"alice") as {brandId:string};
  const profile=defaultProfile();profile.approvedReplies=["Hello there."];profile.sendEnabled=true;
  sql.prepare("UPDATE social_brands SET profile=? WHERE id=?").run(JSON.stringify(profile),created.brandId);
  const account:SocialAccount={id:"account-a",brand_id:created.brandId,provider:"facebook",asset_id:"page-a",parent_id:"page-a",provider_user_id:"meta-user",name:"Page A",token:await encrypt("page-token",env.TOKEN_ENCRYPTION_KEY),user_token:await encrypt("user-token",env.TOKEN_ENCRYPTION_KEY),expires_at:Date.now()+86400000,permissions:JSON.stringify(scopes),status:"connected",validation:JSON.stringify({historyProbeVersion:2,reads:{messages:true,comments:true},tasks:["MANAGE","MESSAGING","MODERATE"]}),validated_at:Date.now(),monitoring:'{"enabled":false,"intervalMinutes":10}',last_reconciled_at:null,created_at:Date.now()};
  sql.prepare("INSERT INTO social_accounts (id,brand_id,provider,asset_id,parent_id,provider_user_id,name,token,user_token,expires_at,permissions,status,validation,validated_at,monitoring,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(account.id,account.brand_id,account.provider,account.asset_id,account.parent_id,account.provider_user_id,account.name,account.token,account.user_token,account.expires_at,account.permissions,account.status,account.validation,account.validated_at,account.monitoring,account.created_at);
  const thread:Thread={id:"thread-a",account_id:account.id,provider_id:"conversation-a",kind:"message",target:"person-a",source_url:null,status:"new",assigned_to:null,next_action:"Review",last_inbound_at:Date.now()-60000,updated_at:Date.now()};
  sql.prepare("INSERT INTO social_threads (id,account_id,provider_id,kind,target,status,next_action,last_inbound_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(thread.id,account.id,thread.provider_id,thread.kind,thread.target,thread.status,thread.next_action,thread.last_inbound_at,thread.updated_at);
  sql.prepare("INSERT INTO social_runtime (key,value) VALUES ('maintenance',?)").run(Date.now());
  return {env,sql,account,thread,brandId:created.brandId,customerId:customer.customerId,scope:{brandId:created.brandId,accountId:account.id,threadId:thread.id}};
}
function provider(t:TestContext, options:{at?:number;many?:boolean;changed?:()=>boolean;failSend?:boolean}={}) {
  let sends=0;const at=new Date(options.at||Date.now()-60000).toISOString();const seen:string[]=[];
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input));seen.push(url.pathname);
    assert.equal(url.origin,"https://graph.facebook.com");
    if(init?.method==="POST") {sends++;if(options.failSend)throw new Error("network lost with secret page-token");return Response.json({message_id:"sent-1"});}
    const path=url.pathname.replace("/v26.0/","");
    if(path==="debug_token")return Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes,expires_at:Math.floor(Date.now()/1000)+86400}});
    if(path==="me/accounts")return Response.json({data:[{id:"page-a",access_token:"page-token",tasks:["MANAGE","MESSAGING","MODERATE"],instagram_business_account:{id:"ig-a"}}]});
    if(path==="page-a/subscribed_apps")return Response.json({data:[{id:"platform",subscribed_fields:["messages","feed","comments"]}]});
    if(path==="page-a")return Response.json({id:"page-a",name:"Page A"});
    if(path==="page-a/conversations")return Response.json({data:[{id:"conversation-a"}]});
    if(path==="page-a/feed")return Response.json({data:[]});
    if(path==="conversation-a")return Response.json({id:path,participants:{data:[{id:"page-a"},{id:"person-a"}]},is_owner:true});
    if(path==="conversation-a/messages")return Response.json({data:Array.from({length:options.many?25:1},(_,i)=>({id:`message-${i}`}))});
    if(path.startsWith("message-"))return Response.json({id:path,message:options.changed?.()?"Changed":"Hi",from:{id:"person-a"},created_time:at});
    throw new Error(`Unexpected request ${path}`);
  });
  return {sends:()=>sends,seen};
}
async function prepared(f:Awaited<ReturnType<typeof fixture>>) {
  const history=await readThread(f.env,"alice",f.account,f.thread);
  const draft=await socialAction("social_draft_create",{...f.scope,snapshotId:history.snapshotId,text:"Hello there."},f.env,"alice") as {draftId:string;revision:string};
  const inspect=await socialAction("social_draft_inspect",{...f.scope,draftId:draft.draftId},f.env,"alice") as {approvalToken:string;requiredConfirmation:string};
  return {...f.scope,...draft,approvalToken:inspect.approvalToken,confirmed:true,confirmation:inspect.requiredConfirmation};
}

test("new brands start without business identity, verified URLs or inherited customer rules",async()=>{
  const f=await fixture();
  const created=await socialAction("social_brand_create",{customerId:f.customerId,name:"Brand B"},f.env,"alice") as {brandId:string;profile:ReturnType<typeof defaultProfile>};
  assert.deepEqual(created.profile.verifiedUrls,[]);assert.deepEqual(created.profile.verifiedFacts,[]);assert.deepEqual(created.profile.approvedReplies,[]);
  assert.equal(created.profile.identityResponse,"");assert.equal(created.profile.sendEnabled,false);assert.equal(created.profile.forbidDashes,false);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_accounts WHERE brand_id=?").get(created.brandId)!.n,0);
  const profile=defaultProfile();profile.language="Australian English";profile.forbidDashes=true;profile.verifiedUrls=["https://brand-b.example.test/"];
  await socialAction("social_brand_update",{brandId:created.brandId,name:"Brand B",revision:1,profile},f.env,"alice");
  const saved=JSON.parse((await brandFor(f.env,"alice",created.brandId)).profile);
  const other=JSON.parse((await brandFor(f.env,"alice",f.brandId)).profile);
  assert.equal(saved.language,"Australian English");assert.equal(saved.forbidDashes,true);assert.deepEqual(saved.verifiedUrls,["https://brand-b.example.test/"]);
  assert.deepEqual(other.verifiedUrls,[]);assert.equal(other.forbidDashes,false);
  const fresh=defaultProfile();assert.deepEqual(fresh.verifiedUrls,[]);assert.equal(fresh.forbidDashes,false);
});
test("retired preset clients receive an explicit error without creating a weaker brand policy",async()=>{
  const f=await fixture();
  await assert.rejects(socialAction("social_brand_create",{customerId:f.customerId,name:"Legacy",preset:"retired-customer-preset"},f.env,"alice"),/presets are no longer supported/);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_brands WHERE customer_id=?").get(f.customerId)!.n,1);
});
test("tenant isolation applies to discovery, brand IDs, accounts, threads and role changes",async()=>{
  const f=await fixture();
  const b=await socialAction("social_customer_create",{name:"B"},f.env,"bob") as {customerId:string};
  const brandB=await socialAction("social_brand_create",{customerId:b.customerId,name:"B"},f.env,"bob") as {brandId:string};
  const listed=await socialAction("social_workspace_list",{},f.env,"bob") as {brands:unknown[]};assert.equal(listed.brands.length,1);
  await assert.rejects(brandFor(f.env,"bob",f.brandId),/not found/);
  await assert.rejects(accountFor(f.env,"bob",brandB.brandId,f.account.id),/not found/);
  await assert.rejects(socialAction("social_brand_create",{customerId:f.customerId,name:"Injected"},f.env,"bob"),/not found/);
  await assert.rejects(socialAction("social_thread_read",{...f.scope,brandId:brandB.brandId},f.env,"bob"),/not found/);
  await assert.rejects(socialAction("social_member_set",{customerId:f.customerId,userId:"bob",role:"admin",confirmed:true},f.env,"bob"),/not found/);
});
test("viewer cannot edit brand policy, create drafts, connect or send",async()=>{
  const f=await fixture();f.sql.prepare("INSERT INTO social_members (id,customer_id,user_id,role) VALUES ('viewer',?,'viewer','viewer')").run(f.customerId);
  for(const action of ["social_brand_update","social_draft_create","social_account_connect","social_reply_send"]){await assert.rejects(socialAction(action,{...f.scope},f.env,"viewer"),/role/);}
  assert.equal((await socialAction("social_account_list",{brandId:f.brandId},f.env,"viewer") as {accounts:unknown[]}).accounts.length,1);
});
test("tokens and granting identities never appear in account discovery",async()=>{const f=await fixture();const result=JSON.stringify(await socialAction("social_account_list",{brandId:f.brandId},f.env,"alice"));assert.doesNotMatch(result,/page-token|user-token|meta-user|encrypted|v1\./);assert.equal(safeAccount(f.account).id,"account-a");});
test("linked mailboxes remain restricted to their owner and provider records survive customer deletion",async()=>{
  const f=await fixture();f.sql.prepare("INSERT INTO email_accounts (id,user_id,provider,provider_account_id,email,label,encrypted_access_token,scopes,created_at,updated_at) VALUES ('email-a','alice','google','ga','a@example.test','Work','encrypted','',1,1)").run();
  const result=await socialAction("social_email_link",{brandId:f.brandId,emailAccountId:"email-a"},f.env,"alice") as {accountId:string};
  f.sql.prepare("INSERT INTO social_members (id,customer_id,user_id,role) VALUES ('bob',?,'bob','admin')").run(f.customerId);
  await assert.rejects(accountFor(f.env,"bob",f.brandId,result.accountId),/mailbox owner/);
  await socialAction("social_customer_delete",{customerId:f.customerId,confirmation:`Delete customer ${f.customerId}`},f.env,"alice");
  assert.equal(f.sql.prepare("SELECT count(*) n FROM email_accounts").get()!.n,1);assert.equal(f.sql.prepare("SELECT count(*) n FROM social_accounts").get()!.n,0);
});
test("CSRF and unauthenticated API writes are rejected",async()=>{
  const f=await fixture();const body=JSON.stringify({action:"social_customer_create",args:{name:"Injected"}});
  const cross=await handleSocial(new Request("https://senderdeck.test/api/social",{method:"POST",headers:{origin:"https://evil.test","content-type":"application/json","x-dev-user-email":"alice"},body}),f.env,()=>{});assert.equal(cross?.status,403);
  const unauth=await handleSocial(new Request("https://senderdeck.test/api/social",{method:"POST",headers:{origin:"https://senderdeck.test","content-type":"application/json"},body}),f.env,()=>{});assert.equal(unauth?.status,401);
});
test("Meta sign-in requires configured credentials and brand permission but no maintenance heartbeat",async()=>{const f=await fixture();await assert.rejects(startOAuth({...f.env,META_APP_SECRET:undefined},"alice",f.brandId),/not configured/);f.sql.prepare("DELETE FROM social_runtime").run();const env={...f.env,SOCIAL_SCHEDULER_ENABLED:"false"};assert.match((await startOAuth(env,"alice",f.brandId)).authorizationUrl,/facebook.com/);assert.equal((await customerSetup(env,"alice",f.brandId)).canConnect,true);await assert.rejects(startOAuth(env,"bob",f.brandId),/not found/);f.sql.prepare("UPDATE social_members SET role='viewer' WHERE user_id='alice'").run();await assert.rejects(startOAuth(env,"alice",f.brandId),/role/);assert.equal((await customerSetup(env,"alice",f.brandId)).canConnect,false);assert.equal(platformStatus({} as Env).sending,"disabled");});
test("OAuth state is user-bound, one-use and preserves the fixed callback origin",async(t)=>{
  const f=await fixture();const start=await startOAuth(f.env,"alice",f.brandId);const auth=new URL(start.authorizationUrl);assert.equal(auth.searchParams.get("redirect_uri"),"https://senderdeck.test/oauth/social/meta/callback");
  const callback=(user:string)=>new Request(`https://evil-host.test/oauth/social/meta/callback?state=${auth.searchParams.get("state")}&code=code`,{headers:{"x-dev-user-email":user}});
  assert.match((await oauthCallback(callback("bob"),f.env))!.headers.get("location")!,/connection=restart_required/);
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{const url=new URL(String(input));if(url.pathname.endsWith("oauth/access_token"))return Response.json({access_token:"user-token"});if(url.pathname.endsWith("debug_token"))return Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes}});return Response.json({data:[{id:"page-a",name:"A",access_token:"page-token",tasks:["MANAGE"]}]});});
  const response=await oauthCallback(callback("alice"),f.env);assert.equal(response?.status,303);assert.match(response!.headers.get("location")!,/^https:\/\/senderdeck.test\/connect\/meta/);
  assert.match((await oauthCallback(callback("alice"),f.env))!.headers.get("location")!,/connection=restart_required/);
  const row=f.sql.prepare("SELECT id,encrypted FROM social_grants").get()!;assert.doesNotMatch(String(row.encrypted),/user-token|page-token/);
  const assets=JSON.stringify(await grantAssets(f.env,"alice",f.brandId,String(row.id)));assert.doesNotMatch(assets,/token|meta-user/);
  await assert.rejects(grantAssets(f.env,"bob",f.brandId,String(row.id)),/not found/);
});
test("asset selection rejects an ID absent from live OAuth discovery",async(t)=>{
  const f=await fixture();const grant={userToken:"user-token",providerUserId:"meta-user",permissions:scopes,candidates:[],expiresAt:null};
  f.sql.prepare("INSERT INTO social_grants (id,brand_id,user_id,encrypted,expires_at) VALUES ('grant',?,'alice',?,?)").run(f.brandId,await encrypt(JSON.stringify(grant),f.env.TOKEN_ENCRYPTION_KEY),Date.now()+60000);
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>String(input).includes("debug_token")?Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes}}):Response.json({data:[]}));
  await assert.rejects(selectAsset(f.env,"alice",f.brandId,"grant","facebook","invented"),/not present/);
});

test("asset discovery identifies existing assignments without exposing another workspace or altering its data",async t=>{
  const f=await fixture();provider(t);
  const second=await socialAction("social_brand_create",{customerId:f.customerId,name:"Second brand"},f.env,"alice") as {brandId:string};
  const grant={userToken:"user-token",providerUserId:"meta-user",permissions:scopes,candidates:[],expiresAt:null};
  const insert=async(id:string,brand:string)=>f.sql.prepare("INSERT INTO social_grants (id,user_id,brand_id,encrypted,expires_at) VALUES (?,'alice',?,?,?)").run(id,brand,await encrypt(JSON.stringify(grant),f.env.TOKEN_ENCRYPTION_KEY),Date.now()+60000);
  await insert("own",f.brandId);await insert("second",second.brandId);
  const own=await grantAssets(f.env,"alice",f.brandId,"own");assert.deepEqual(own.assets.find(a=>a.provider==="facebook")!.assignment,{state:"this_brand"});assert.deepEqual(own.assets.find(a=>a.provider==="instagram")!.assignment,{state:"available"});
  const visible=await grantAssets(f.env,"alice",second.brandId,"second");assert.deepEqual(visible.assets.find(a=>a.provider==="facebook")!.assignment,{state:"other_brand",brandId:f.brandId,brandName:"Brand A"});
  const before=f.sql.prepare("SELECT * FROM social_accounts WHERE id=?").get(f.account.id);
  await assert.rejects(selectAsset(f.env,"alice",second.brandId,"second","facebook","page-a"),/existing connection has been preserved/);
  assert.deepEqual(f.sql.prepare("SELECT * FROM social_accounts WHERE id=?").get(f.account.id),before);assert.equal(f.sql.prepare("SELECT count(*) n FROM social_threads").get()!.n,1);
  f.sql.prepare("DELETE FROM social_members WHERE customer_id=? AND user_id='alice'").run(f.customerId);
  const hidden=await grantAssets(f.env,"alice",second.brandId,"second").catch(()=>null);
  // Second brand must be in a different accessible customer for the hidden case.
  assert.equal(hidden,null);
  const customer=await socialAction("social_customer_create",{name:"Separate workspace"},f.env,"alice") as {customerId:string};const other=await socialAction("social_brand_create",{customerId:customer.customerId,name:"Target brand"},f.env,"alice") as {brandId:string};await insert("hidden",other.brandId);
  const inaccessible=await grantAssets(f.env,"alice",other.brandId,"hidden");assert.deepEqual(inaccessible.assets.find(a=>a.provider==="facebook")!.assignment,{state:"other_workspace"});assert.doesNotMatch(JSON.stringify(inaccessible),new RegExp(f.brandId));
});
test("Meta pagination follows short pages and rejects foreign token-exfiltration URLs",async(t)=>{
  let calls=0;t.mock.method(globalThis,"fetch",async()=>{calls++;return Response.json(calls===1?{data:[{id:1}],paging:{next:"https://graph.facebook.com/v26.0/page/feed?after=next&access_token=ignored"}}:{data:[{id:2}]});});
  const result=await graphPages("token","page/feed");assert.equal(result.rows.length,2);assert.equal(result.coverage.complete,true);
  t.mock.method(globalThis,"fetch",async()=>Response.json({data:[],paging:{next:"https://evil.test/steal"}}));await assert.rejects(graphPages("token","page/feed"),/pagination URL/);
});
test("pagination cycles and bounded work are reported as incomplete",async(t)=>{t.mock.method(globalThis,"fetch",async()=>Response.json({data:[{id:1}],paging:{next:"https://graph.facebook.com/v26.0/page/feed"}}));const result=await graphPages("token","page/feed",{},2);assert.equal(result.coverage.complete,false);assert.ok(result.coverage.gaps.length);});
test("message reads report the provider's 20-detail limit",async(t)=>{const f=await fixture();provider(t,{many:true});const result=await readHistory(f.env,f.account,f.thread);assert.equal(result.items.length,20);assert.equal(result.coverage.complete,false);assert.ok(result.coverage.gaps.includes("provider_only_exposes_20_recent_message_details"));});
test("comment tree reads include nested replies and their paginated continuations",async(t)=>{
  const f=await fixture();const thread={...f.thread,kind:"comment" as const,provider_id:"post",target:"post"};
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{const u=new URL(String(input));const p=u.pathname.replace("/v26.0/","");if(p==="post")return Response.json({id:"post",message:"Root",can_comment:true});if(p==="post/comments")return Response.json({data:[{id:"c1",message:"First",comment_count:2}]});if(p==="c1/comments"&&!u.searchParams.has("after"))return Response.json({data:[{id:"r1",message:"Reply one"}],paging:{next:"https://graph.facebook.com/v26.0/c1/comments?after=2"}});return Response.json({data:[{id:"r2",message:"Reply two"}]});});
  const result=await readHistory(f.env,f.account,thread);assert.deepEqual(result.items.map(i=>i.id),["c1","post","r1","r2"]);assert.equal(result.coverage.complete,true);assert.equal(result.coverage.pages,3);
});
test("brand policy is configurable and blocks escalation, false identity and unapproved wording",()=>{
  const profile=defaultProfile();profile.forbidDashes=true;profile.avoidUnsolicitedAi=true;profile.verifiedUrls=["https://brand-a.example.test/product-info/"];const history:History={items:[{id:"m",text:"Hi",from:"p",at:Date.now(),attachments:false}],coverage:{complete:true,pages:1,gaps:[],sourceUrl:null},target:"p",lastInboundAt:Date.now(),owned:true};
  profile.approvedReplies=["See https://brand-a.example.test/product-info/", "We can help - welcome."];
  assert.equal(assess(profile,"See https://brand-a.example.test/product-info/",history).sendable,true);
  assert.ok(assess(profile,"We can help - welcome.",history).blockers.includes("brand_disallows_dashes"));
  assert.ok(assess(profile,"It costs $20 and is guaranteed.",history).blockers.includes("wording_requires_brand_admin_approval"));
  history.items[0].text="I was injured and need a refund";assert.ok(assess(profile,"See https://brand-a.example.test/product-info/",history).blockers.includes("escalation_requires_owner_handling"));
  history.items[0].text="Are you a bot?";assert.ok(assess(profile,"I am Chris.",history).blockers.includes("identity_question_requires_truthful_approved_response"));
  assert.equal(defaultProfile().forbidDashes,false);assert.throws(()=>validateProfile({...profile,retentionDays:1000}),/retention/);
});
test("draft creation requires a current reader-bound snapshot and rejects attachments or foreign targets",async(t)=>{
  const f=await fixture();provider(t);await assert.rejects(socialAction("social_draft_create",{...f.scope,snapshotId:"invented",text:"Hi"},f.env,"alice"),/Read this thread again/);
  const history=await readThread(f.env,"alice",f.account,f.thread);
  await assert.rejects(socialAction("social_draft_create",{...f.scope,snapshotId:history.snapshotId,text:"Hi",targetId:"another-person"},f.env,"alice"),/target/);
  await assert.rejects(socialAction("social_draft_create",{...f.scope,snapshotId:history.snapshotId,text:"Hi",attachments:["x"]},f.env,"alice"),/attachment/);
});
test("fresh exact approval sends once; duplicate requests never call the provider again",async(t)=>{
  const f=await fixture();const mock=provider(t);const args=await prepared(f);
  const results=await Promise.allSettled([socialAction("social_reply_send",args,f.env,"alice"),socialAction("social_reply_send",args,f.env,"alice")]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(mock.sends(),1);
  await assert.rejects(socialAction("social_reply_send",args,f.env,"alice"));assert.equal(mock.sends(),1);
});
test("approval rejects changed revision, wrong token, missing confirmation and different account",async(t)=>{
  const f=await fixture();const mock=provider(t);const args=await prepared(f);
  for(const change of [{revision:"changed"},{approvalToken:"wrong"},{confirmed:false},{confirmation:"send"},{accountId:"other"}])await assert.rejects(socialAction("social_reply_send",{...args,...change},f.env,"alice"));
  assert.equal(mock.sends(),0);
});
test("expired approval and brand policy changes invalidate a draft",async(t)=>{
  const f=await fixture();const mock=provider(t);let args=await prepared(f);
  f.sql.prepare("UPDATE social_drafts SET approval_expires_at=1").run();await assert.rejects(socialAction("social_reply_send",args,f.env,"alice"),/Fresh explicit/);
  args=await prepared(f);f.sql.prepare("UPDATE social_brands SET revision=revision+1").run();await assert.rejects(socialAction("social_reply_send",args,f.env,"alice"),/Brand rules changed/);assert.equal(mock.sends(),0);
});
test("history changes and expired review snapshots block sends",async(t)=>{
  const f=await fixture();let changed=false;const mock=provider(t,{changed:()=>changed});const args=await prepared(f);changed=true;
  await assert.rejects(socialAction("social_reply_send",args,f.env,"alice"),/Conversation changed/);assert.equal(mock.sends(),0);
});
test("24-hour message window and disabled rollout block sends",async(t)=>{
  const f=await fixture();const mock=provider(t,{at:Date.now()-25*3600000});const args=await prepared(f);
  await assert.rejects(socialAction("social_reply_send",args,{...f.env,SOCIAL_SEND_ENABLED:"false"},"alice"),/disabled/);
  await assert.rejects(socialAction("social_reply_send",args,f.env,"alice"),/24-hour/);assert.equal(mock.sends(),0);
});
test("ambiguous delivery cannot be retried and secrets are not exposed",async(t)=>{
  const f=await fixture();const mock=provider(t,{failSend:true});const args=await prepared(f);
  await assert.rejects(socialAction("social_reply_send",args,f.env,"alice"),e=>{assert.doesNotMatch(String(e),/page-token|network lost/);return /could not be confirmed/.test(String(e));});
  assert.equal(f.sql.prepare("SELECT state FROM social_drafts WHERE id=?").get(args.draftId)!.state,"delivery_unknown");await assert.rejects(socialAction("social_reply_send",args,f.env,"alice"));assert.equal(mock.sends(),1);
});
test("a newer draft supersedes the old immutable revision",async(t)=>{const f=await fixture();const mock=provider(t);const previous=await prepared(f);await prepared(f);await assert.rejects(socialAction("social_reply_send",previous,f.env,"alice"));assert.equal(mock.sends(),0);});
test("missing permission, unvalidated reads and stale health never advertise capability",async()=>{const f=await fixture();assert.equal(capabilities(f.env,f.account).messages,"available");assert.equal(capabilities(f.env,{...f.account,permissions:"[]"}).messages,"unavailable");assert.equal(capabilities(f.env,{...f.account,validated_at:1}).messages,"unavailable");assert.equal(capabilities({...f.env,SOCIAL_SEND_ENABLED:"false"},f.account).sendMessages,false);});
test("webhook signatures use exact raw body and verified events are durably deduplicated",async()=>{
  const f=await fixture();const raw=JSON.stringify({object:"page",entry:[{id:"page-a",messaging:[{sender:{id:"person"},message:{mid:"mid",text:"Hello"}}]}]});
  const request=(body:string,signature:string)=>new Request("https://senderdeck.test/api/social/webhooks/meta",{method:"POST",headers:{"x-hub-signature-256":signature},body});
  const signature=`sha256=${await hmac(f.env.META_APP_SECRET!,raw)}`;
  await assert.rejects(receiveMeta(request(raw+" ",signature),f.env,()=>{}),/signature/);
  await receiveMeta(request(raw,signature),f.env,()=>{});await receiveMeta(request(raw,signature),f.env,()=>{});await processQueue(f.env);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_queue").get()!.n,1);assert.equal(f.sql.prepare("SELECT count(*) n FROM social_notices").get()!.n,1);
  const row=f.sql.prepare("SELECT encrypted,state FROM social_queue").get()!;assert.equal(row.encrypted,"");assert.equal(row.state,"done");
});
test("webhooks ignore other assets, outgoing echoes, read receipts and page likes",async()=>{
  const f=await fixture();const raw=JSON.stringify({object:"page",entry:[{id:"unowned",messaging:[{message:{mid:"foreign",text:"Hi"}}]},{id:"page-a",messaging:[{message:{mid:"echo",is_echo:true}},{read:{watermark:1}}],changes:[{field:"feed",value:{item:"like"}}]}]});
  await receiveMeta(new Request("https://senderdeck.test/api/social/webhooks/meta",{method:"POST",headers:{"x-hub-signature-256":`sha256=${await hmac(f.env.META_APP_SECRET!,raw)}`},body:raw}),f.env,()=>{});
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_queue").get()!.n,0);
});
test("barriers are reported once and monitoring preference is not active coverage",async()=>{
  const f=await fixture();await notice(f.env,f.account.id,"blocked","access:blocked");await notice(f.env,f.account.id,"blocked","access:blocked");assert.equal(f.sql.prepare("SELECT count(*) n FROM social_notices").get()!.n,1);
  const result=await socialAction("social_monitor_configure",{...f.scope,enabled:true,intervalMinutes:10},f.env,"alice") as {active:boolean};assert.equal(result.active,false);
});
test("retention cleanup removes expired content and persists a scheduler heartbeat",async()=>{
  const f=await fixture();f.sql.prepare("INSERT INTO social_snapshots (id,thread_id,user_id,digest,encrypted,complete,expires_at) VALUES ('expired',?,'alice','hash','secret',1,1)").run(f.thread.id);
  await maintenance(f.env);assert.equal(f.sql.prepare("SELECT count(*) n FROM social_snapshots").get()!.n,0);assert.ok(Number(f.sql.prepare("SELECT value FROM social_runtime").get()!.value)>1);
});
test("provider deletion requires a signed request and cascades only affected social data",async()=>{
  const f=await fixture();const payload=Buffer.from(JSON.stringify({algorithm:"HMAC-SHA256",user_id:"meta-user",issued_at:Math.floor(Date.now()/1000)})).toString("base64url");const signature=Buffer.from(await hmac(f.env.META_APP_SECRET!,payload),"hex").toString("base64url");
  await assert.rejects(verifySignedRequest(f.env.META_APP_SECRET!,`invalid.${payload}`),/signature/);
  const request=new Request("https://senderdeck.test/api/social/meta/delete",{method:"POST",body:new URLSearchParams({signed_request:`${signature}.${payload}`})});assert.equal((await metaDeletion(request,f.env)).status,200);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_accounts").get()!.n,0);assert.equal(f.sql.prepare("SELECT count(*) n FROM social_threads").get()!.n,0);assert.equal(f.sql.prepare("SELECT count(*) n FROM social_customers").get()!.n,1);
});

test("scheduler endpoint rejects anonymous callers and malformed browser requests are 400",async()=>{
  const f=await fixture();const denied=await handleSocial(new Request("https://senderdeck.test/api/social/maintenance",{method:"POST"}),f.env,()=>{});assert.equal(denied?.status,401);
  const malformed=await handleSocial(new Request("https://senderdeck.test/api/social",{method:"POST",headers:{origin:"https://senderdeck.test","content-type":"application/json","x-dev-user-email":"alice"},body:"null"}),f.env,()=>{});assert.equal(malformed?.status,400);
});
test("failed queue processing retries are bounded and visible without retaining plaintext",async()=>{
  const f=await fixture();f.sql.prepare("INSERT INTO social_queue (id,account_id,encrypted,state,attempts,created_at,expires_at) VALUES ('bad',?,'broken-ciphertext','pending',4,?,?)").run(f.account.id,Date.now(),Date.now()+60000);
  await processQueue(f.env);const row=f.sql.prepare("SELECT state,attempts,error FROM social_queue WHERE id='bad'").get()!;assert.equal(row.state,"failed");assert.equal(row.attempts,5);assert.equal(row.error,"processing_failed");
  const activity=await socialAction("social_activity_list",{brandId:f.brandId},f.env,"alice") as {processing:unknown[]};assert.equal(activity.processing.length,1);
});
test("LinkedIn API identities cannot be linked and identity linking requires customer confirmation",async()=>{
  const f=await fixture();await assert.rejects(socialAction("social_identity_link",{brandId:f.brandId,identities:[{accountId:f.account.id,identity:"person"},{accountId:f.account.id,identity:"other"}],confirmed:false},f.env,"alice"),/confirmation/);
  f.sql.prepare("UPDATE social_accounts SET provider='linkedin' WHERE id=?").run(f.account.id);
  await assert.rejects(socialAction("social_identity_link",{brandId:f.brandId,identities:[{accountId:f.account.id,identity:"urn:li:person:1"},{accountId:f.account.id,identity:"other"}],confirmed:true},f.env,"alice"),/LinkedIn/);
});
test("disconnect removes confirmed identity links without touching another brand",async()=>{
  const f=await fixture();await socialAction("social_identity_link",{brandId:f.brandId,identities:[{accountId:f.account.id,identity:"person"},{accountId:f.account.id,identity:"verified-email@example.test"}],confirmed:true},f.env,"alice");
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_identity_links").get()!.n,1);
  await socialAction("social_account_disconnect",{...f.scope,confirmed:true},f.env,"alice");assert.equal(f.sql.prepare("SELECT count(*) n FROM social_identity_links").get()!.n,0);
});

test("customer setup keeps infrastructure diagnostics in the operator area",async()=>{
  const f=await fixture();
  const blocked=await customerSetup({...f.env,META_APP_SECRET:undefined,SOCIAL_SCHEDULER_ENABLED:"false"},"alice",f.brandId);
  assert.equal(blocked.canConnect,false);assert.equal(blocked.appConfigured,false);assert.equal(blocked.needsCustomerDeveloperCredentials,false);assert.equal(blocked.blockers.length,1);assert.equal(blocked.monitoringActive,false);assert.ok(!("runtime" in blocked));assert.doesNotMatch(JSON.stringify(blocked.blockers),/maintenance|scheduler|credentials/);
  const ready=await customerSetup(f.env,"alice",f.brandId);assert.equal(ready.canConnect,true);assert.equal(ready.businessVerification,"not_confirmed_by_senderdeck");
  await assert.rejects(customerSetup(f.env,"bob",f.brandId),/not found/);
  assert.doesNotMatch(JSON.stringify(ready),/app-secret|page-token|user-token/);
});
test("workspace owners and spoofed operator headers cannot administer the platform",async()=>{
  const f=await fixture();await assert.rejects(operatorSetup(f.env,"alice"),/administrator access/);
  const request=new Request("https://senderdeck.test/api/social/operator/setup",{headers:{"x-dev-user-email":"alice","x-senderdeck-platform-operator":"true"}});
  assert.equal((await handleSocial(request,f.env,()=>{}))?.status,403);
  const write=new Request("https://senderdeck.test/api/social/operator/setup",{method:"POST",headers:{origin:"https://senderdeck.test","content-type":"application/json","x-dev-user-email":"alice"},body:JSON.stringify({META_APP_SECRET:"injected"})});
  assert.equal((await handleSocial(write,f.env,()=>{}))?.status,404);assert.equal(f.env.META_APP_SECRET,"app-secret");
});
test("operator readiness masks native secrets and does not infer review or event delivery",async()=>{
  const f=await fixture();const env={...f.env,SOCIAL_OPERATOR_USER_IDS:"platform-operator",META_WEBHOOK_VERIFY_TOKEN:"hidden-verify",SOCIAL_MAINTENANCE_TOKEN:"hidden-maintenance"};
  const state=await operatorSetup(env,"platform-operator");
  assert.doesNotMatch(JSON.stringify(state),/app-secret|hidden-verify|hidden-maintenance/);
  assert.equal(state.fields.find(f=>f.key==="META_APP_SECRET")?.configured,true);assert.equal(state.fields.find(f=>f.key==="META_APP_SECRET")?.secret,true);
  assert.equal(state.businessVerification,"must_be_verified_in_meta");assert.equal(state.webhookLastObservedAt,null);
  assert.equal(state.routes.callback,"https://senderdeck.test/oauth/social/meta/callback");
  assert.equal(state.routes.webhook,"https://senderdeck.test/api/social/webhooks/meta");
});
test("app credential check is operator-only and does not certify business or customer access",async(t)=>{
  const f=await fixture();const env={...f.env,SOCIAL_OPERATOR_USER_IDS:"platform-operator"};let calls=0;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{calls++;if(String(input).includes("oauth/access_token")){assert.equal(init?.method,"POST");assert.equal(new URLSearchParams(String(init?.body)).get("client_secret"),"app-secret");assert.ok(!String(input).includes("app-secret"));return Response.json({access_token:"verified-app-token"});}return Response.json({id:"platform",name:"Test platform app"});});
  await assert.rejects(checkOperatorApp(env,"alice"),/administrator/);assert.equal(calls,0);
  const result=await checkOperatorApp(env,"platform-operator");assert.equal(result.appVerified,true);assert.equal(result.businessVerification,"not_checked");assert.equal(result.customerAccessApproval,"not_checked");
  assert.doesNotMatch(JSON.stringify(result),/app-secret/);
});

async function operatorFixture() {
  const f=await fixture(); const operator="verified-operator", session="operator-session";
  f.sql.prepare("INSERT INTO senderdeck_identities VALUES ('google','verified-id',?,'operator@example.test',?,?)").run(operator,Date.now(),Date.now());
  f.sql.prepare("INSERT INTO senderdeck_sessions VALUES (?,?, 'operator@example.test',?,?)").run(await sha256Base64Url(session),operator,Date.now(),Date.now()+3600000);
  const env:Env={...f.env,SOCIAL_OPERATOR_USER_IDS:operator,META_APP_SECRET:undefined,META_WEBHOOK_VERIFY_TOKEN:undefined};
  const headers={cookie:`senderdeck_session=${session}`,origin:"https://senderdeck.test","content-type":"application/json"};
  const setup=await handleSocial(new Request("https://senderdeck.test/api/social/operator/setup",{headers}),env,()=>{});
  const csrf=(await setup!.json() as {csrfToken:string}).csrfToken;
  const write=(body:unknown,changes:Record<string,string>={},otherEnv=env)=>handleSocial(new Request("https://senderdeck.test/api/social/operator/secrets",{method:"POST",headers:{...headers,"x-senderdeck-csrf":csrf,...changes},body:JSON.stringify(body)}),otherEnv,()=>{});
  return {...f,env,headers,csrf,write};
}
test("verified operator saves only encrypted Meta secrets with metadata-only audit and redacted reads",async()=>{
  const f=await operatorFixture(); const app="0123456789abcdef0123456789abcdef", verify="a-separate-random-verification-token";
  const response=await f.write({META_APP_SECRET:app,META_WEBHOOK_VERIFY_TOKEN:verify});
  assert.equal(response!.status,200);assert.equal(response!.headers.get("cache-control"),"no-store");
  assert.doesNotMatch(await response!.text(),new RegExp(`${app}|${verify}`));
  const rows=f.sql.prepare("SELECT * FROM social_platform_secrets").all();assert.equal(rows.length,2);
  for(const row of rows){assert.match(String(row.encrypted),/^v1\./);assert.doesNotMatch(JSON.stringify(row),new RegExp(`${app}|${verify}`));}
  const resolved=await resolveMetaSecrets(f.env);assert.equal(resolved.META_APP_SECRET,app);assert.equal(resolved.META_WEBHOOK_VERIFY_TOKEN,verify);assert.equal(f.env.META_APP_SECRET,undefined);
  const audit=f.sql.prepare("SELECT * FROM social_platform_audit").all();assert.equal(audit.length,1);assert.doesNotMatch(JSON.stringify(audit),new RegExp(`${app}|${verify}`));
  const status=await operatorSetup(f.env,"verified-operator");assert.equal(status.platform.meta.configured,true);assert.doesNotMatch(JSON.stringify(status),new RegExp(`${app}|${verify}|v1\\.`));
  assert.equal(status.fields.find(x=>x.key==="META_APP_SECRET")?.source,"encrypted_store");
  const customer=await socialAction("social_workspace_list",{},f.env,"alice");assert.doesNotMatch(JSON.stringify(customer),new RegExp(`${app}|${verify}|v1\\.`));
});

test("webhook verification token is generated encrypted once and never rotates existing configuration", async () => {
  const f = await fixture(); const env = { ...f.env, META_WEBHOOK_VERIFY_TOKEN: undefined };
  const first = await ensureWebhookToken(env), second = await ensureWebhookToken(env);
  assert.match(first.META_WEBHOOK_VERIFY_TOKEN!, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.META_WEBHOOK_VERIFY_TOKEN, second.META_WEBHOOK_VERIFY_TOKEN);
  assert.doesNotMatch(String(f.sql.prepare("SELECT encrypted FROM social_platform_secrets").get()!.encrypted), new RegExp(first.META_WEBHOOK_VERIFY_TOKEN!));
  assert.equal((await ensureWebhookToken(f.env)).META_WEBHOOK_VERIFY_TOKEN, "verify-secret");
});

test("operator Page registration verifies the real challenge and preserves fields without leaking tokens", async t => {
  const f = await operatorFixture(), env = { ...f.env, META_APP_SECRET: "app-secret" };
  const setup = await handleSocial(new Request("https://senderdeck.test/api/social/operator/setup", { headers: f.headers }), env, () => {});
  const csrf = (await setup!.json()).webhookCsrfToken; let registered = false;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); assert.doesNotMatch(url.href, /app-secret|verify-secret/);
    if (url.pathname.endsWith("oauth/access_token")) return Response.json({ access_token: "app-credential" });
    if (init?.method === "POST") {
      const body = new URLSearchParams(String(init.body));
      assert.equal(body.get("object"), "page"); assert.ok(body.get("fields")!.includes("leadgen"));
      const verification = new URL(body.get("callback_url")!); verification.search = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": body.get("verify_token")!, "hub.challenge": "challenge" }).toString();
      const proof = await handleSocial(new Request(verification), env, () => {});
      assert.equal(await proof!.text(), "challenge"); registered = true;
      return Response.json({ success: true });
    }
    return Response.json({ data: [{ object: "page", callback_url: "https://senderdeck.test/api/social/webhooks/meta", active: registered, fields: [{ name: "leadgen" }, { name: "messages" }, { name: "feed" }] }] });
  });
  const response = await handleSocial(new Request("https://senderdeck.test/api/social/operator/webhook", { method: "POST", headers: { ...f.headers, "x-senderdeck-csrf": csrf }, body: "{}" }), env, () => {});
  assert.equal(response!.status, 200); const result = await response!.text();
  assert.match(result, /owner_must_configure_in_meta_dashboard/); assert.doesNotMatch(result, /app-credential|app-secret|verificationToken/);
});

test("webhook token copying requires explicit operator session and purpose-bound CSRF", async () => {
  const f = await operatorFixture(), env = { ...f.env, META_APP_SECRET: "app-secret", META_WEBHOOK_VERIFY_TOKEN: "saved-verification-token" };
  const setup = await handleSocial(new Request("https://senderdeck.test/api/social/operator/setup", { headers: f.headers }), env, () => {});
  const csrf = (await setup!.json()).webhookCsrfToken;
  const request = (token: string, origin = "https://senderdeck.test") => new Request("https://senderdeck.test/api/social/operator/webhook-copy", { method: "POST", headers: { ...f.headers, origin, "x-senderdeck-csrf": token }, body: "{}" });
  assert.equal((await handleSocial(request(f.csrf), env, () => {}))!.status, 403);
  assert.equal((await handleSocial(request(csrf, "https://attacker.test"), env, () => {}))!.status, 403);
  const response = await handleSocial(request(csrf), env, () => {});
  assert.equal(response!.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response!.json(), { verificationToken: "saved-verification-token" });
});

test("Page registration refuses to overwrite another integration callback", async t => {
  const f = await operatorFixture(), env = { ...f.env, META_APP_SECRET: "app-secret" };
  const setup = await handleSocial(new Request("https://senderdeck.test/api/social/operator/setup", { headers: f.headers }), env, () => {});
  const csrf = (await setup!.json()).webhookCsrfToken; let subscriptionWrites = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("oauth/access_token")) return Response.json({ access_token: "app-token" });
    if (init?.method === "POST") subscriptionWrites++;
    return Response.json({ data: [{ object: "page", callback_url: "https://other.example.test/webhook", fields: ["messages"] }] });
  });
  const response = await handleSocial(new Request("https://senderdeck.test/api/social/operator/webhook", { method: "POST", headers: { ...f.headers, "x-senderdeck-csrf": csrf }, body: "{}" }), env, () => {});
  assert.equal(response!.status, 409); assert.equal(subscriptionWrites, 0);
});

test("Page event installation is scoped, preserves fields, and refuses Instagram misuse", async t => {
  const f = await fixture(); const mock = provider(t), original = globalThis.fetch; let writes = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(input)).pathname.endsWith("page-a/subscribed_apps")) {
      if (init?.method === "POST") { writes++; assert.equal(new URLSearchParams(String(init.body)).get("subscribed_fields"), "messages,feed,leadgen"); return Response.json({ success: true }); }
      return Response.json({ data: [{ id: "platform", subscribed_fields: ["messages", "feed", "leadgen"] }] });
    }
    return original(input, init);
  });
  await assert.rejects(socialAction("social_webhook_subscribe", { ...f.scope, confirmed: true }, f.env, "bob"));
  await assert.rejects(socialAction("social_webhook_subscribe", f.scope, f.env, "alice"), /Confirm/);
  const result = await socialAction("social_webhook_subscribe", { ...f.scope, confirmed: true }, f.env, "alice") as { subscriptionVerified: boolean };
  assert.equal(result.subscriptionVerified, true); assert.equal(writes, 1); assert.equal(mock.sends(), 0);
  f.sql.prepare("UPDATE social_accounts SET provider='instagram' WHERE id=?").run(f.account.id);
  await assert.rejects(socialAction("social_webhook_subscribe", { ...f.scope, confirmed: true }, f.env, "alice"), /Instagram subscriptions must be configured/);
  assert.equal(writes, 1);
});

test("signed delivery evidence is account-specific and never created by an invalid signature", async () => {
  const f = await fixture(); const deferred: Promise<unknown>[] = [];
  const payload = JSON.stringify({ object: "page", entry: [{ id: "page-a", messaging: [{ sender: { id: "person-a" }, message: { mid: "incoming", text: "Untrusted test data" } }], changes: [{ field: "feed", value: { item: "comment", comment_id: "comment-1" } }] }] });
  const request = (signature: string) => new Request("https://senderdeck.test/api/social/webhooks/meta", { method: "POST", headers: { "x-hub-signature-256": signature }, body: payload });
  assert.equal((await handleSocial(request("sha256=invalid"), f.env, () => {}))!.status, 403);
  assert.equal(await monitoringEvidence(f.env, f.account.id), null);
  const accepted = await handleSocial(request(`sha256=${await hmac("app-secret", payload)}`), f.env, p => deferred.push(p));
  assert.equal(accepted!.status, 200); await Promise.all(deferred);
  const evidence = await monitoringEvidence(f.env, f.account.id); assert.ok(evidence?.messages_at); assert.ok(evidence?.comments_at);
  assert.equal(await monitoringEvidence(f.env, "other-account"), null);
});

test("monitoring distinguishes manual checks, partial coverage and real scheduled execution", async () => {
  const f = await fixture(); const account = { ...f.account, monitoring: '{"enabled":true,"intervalMinutes":10}' };
  await recordDelivery(f.env, account.id, "messages"); await recordDelivery(f.env, account.id, "comments");
  await recordPoll(f.env, account.id, ["provider_history_limit"]);
  const caps = { webhook: true, messages: "available", comments: "available" };
  const manual = await accountMonitoring(f.env, account, caps);
  assert.equal(manual.polling, "recent_completed_check"); assert.equal(manual.active, false); assert.equal(manual.coverage, "partial_or_unverified");
  f.sql.prepare("INSERT INTO social_runtime (key,value) VALUES ('maintenance_scheduled',?)").run(Date.now());
  assert.equal((await accountMonitoring(f.env, account, caps)).active, true);
  assert.equal((await accountMonitoring(f.env, account, { ...caps, messages: "unavailable" })).active, false);
});

test("scheduled scoped checks skip disabled and not-yet-due accounts without any provider call", async t => {
  const f = await fixture(); let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("Should not call provider"); });
  const run = () => socialAction("social_reconcile", { ...f.scope, monitoringOnly: true }, f.env, "alice") as Promise<{skipped:boolean;reason:string}>;
  assert.equal((await run()).reason, "monitoring_disabled");
  f.sql.prepare("UPDATE social_accounts SET monitoring=?,last_reconciled_at=? WHERE id=?").run('{"enabled":true,"intervalMinutes":10}', Date.now(), f.account.id);
  assert.equal((await run()).reason, "not_due"); assert.equal(calls, 0);
  await assert.rejects(socialAction("social_reconcile", { ...f.scope, monitoringOnly: true }, f.env, "bob"));
});

test("a current per-account reconciliation lease prevents duplicate provider work", async t => {
  const f = await fixture(); let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("Should not call provider"); });
  f.sql.prepare("INSERT INTO social_runtime (key,value) VALUES (?,?)").run(`reconcile:${f.account.id}`, Date.now() + 60000);
  await assert.rejects(socialAction("social_reconcile", f.scope, f.env, "alice"), /already has a reconciliation/);
  assert.equal(calls, 0);
});
test("secret writes reject tenant owners, viewers, unverified allowlisted identities and dev auth",async()=>{
  const f=await operatorFixture();const payload={META_APP_SECRET:"0123456789abcdef0123456789abcdef"};
  for(const user of ["alice","bob","carol"]){const response=await f.write(payload,{cookie:"","x-dev-user-email":user,"x-senderdeck-platform-operator":"true"});assert.equal(response!.status,403);}
  const unverified=await f.write(payload,{cookie:"","oai-authenticated-user-id":"verified-operator"},{...f.env,SOCIAL_OPERATOR_USER_IDS:"verified-operator"});
  // A trusted platform identity must also exist in the verified sign-in identity table.
  assert.equal(unverified!.status,403); // session-bound CSRF cannot be borrowed into platform auth
  f.sql.prepare("DELETE FROM senderdeck_identities").run();
  assert.equal((await f.write(payload))!.status,403);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_platform_secrets").get()!.n,0);
});
test("secret writes require same-origin JSON and fresh CSRF bound to user and session",async()=>{
  const f=await operatorFixture();const payload={META_APP_SECRET:"0123456789abcdef0123456789abcdef"};
  for(const changes of ([{origin:"https://attacker.test"},{"content-type":"text/plain"},{"x-senderdeck-csrf":""},{"sec-fetch-site":"cross-site"}] as Record<string,string>[]))assert.equal((await f.write(payload,changes))!.status,403);
  const expired=await encrypt(JSON.stringify({purpose:"meta-secret-write",user:"verified-operator",session:await sha256Base64Url("operator-session"),expires:Date.now()-1}),f.env.TOKEN_ENCRYPTION_KEY);
  assert.equal((await f.write(payload,{"x-senderdeck-csrf":expired}))!.status,403);
  f.sql.prepare("INSERT INTO senderdeck_sessions VALUES (?,?, 'operator@example.test',?,?)").run(await sha256Base64Url("another-session"),"verified-operator",Date.now(),Date.now()+3600000);
  assert.equal((await f.write(payload,{cookie:"senderdeck_session=another-session"}))!.status,403);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_platform_audit").get()!.n,0);
});
test("secret writer rejects arbitrary keys, oversized and invalid values without partial writes",async()=>{
  const f=await operatorFixture();
  for(const body of [{SOCIAL_OPERATOR_USER_IDS:"alice"},{GOOGLE_CLIENT_SECRET:"anything"},{META_APP_SECRET:"short"},{META_APP_SECRET:"0123456789abcdef",META_WEBHOOK_VERIFY_TOKEN:"bad token"},{}])assert.equal((await f.write(body))!.status,400);
  assert.equal((await f.write({META_APP_SECRET:"a".repeat(5000)}))!.status,413);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_platform_secrets").get()!.n,0);
});
test("native secrets override stored entries, cannot be overwritten in the form, and corruption fails closed",async()=>{
  const f=await operatorFixture();const saved="0123456789abcdef0123456789abcdef";
  assert.equal((await f.write({META_APP_SECRET:saved}))!.status,200);
  const native={...f.env,META_APP_SECRET:"native-hosting-secret"};assert.equal((await resolveMetaSecrets(native)).META_APP_SECRET,"native-hosting-secret");
  assert.equal((await f.write({META_APP_SECRET:"replacement-secret-value"},{},native))!.status,409);
  f.sql.prepare("UPDATE social_platform_secrets SET encrypted='corrupt'").run();
  await assert.rejects(resolveMetaSecrets(f.env),/could not be loaded/);
  assert.equal((await resolveMetaSecrets(native)).META_APP_SECRET,"native-hosting-secret");
  assert.equal((await f.write({META_APP_SECRET:saved}))!.status,200);assert.equal((await resolveMetaSecrets(f.env)).META_APP_SECRET,saved);
});
test("webhook signature validation and app checks use the encrypted configuration",async(t)=>{
  const f=await operatorFixture(), app="0123456789abcdef0123456789abcdef", verify="separate-verification-token-value";
  await f.write({META_APP_SECRET:app,META_WEBHOOK_VERIFY_TOKEN:verify});
  const handshake=await handleSocial(new Request(`https://senderdeck.test/api/social/webhooks/meta?hub.mode=subscribe&hub.verify_token=${verify}&hub.challenge=challenge-ok`),f.env,()=>{});
  assert.equal(handshake!.status,200);assert.equal(await handshake!.text(),"challenge-ok");
  const body=JSON.stringify({object:"page",entry:[]});
  const delivery=await handleSocial(new Request("https://senderdeck.test/api/social/webhooks/meta",{method:"POST",headers:{"x-hub-signature-256":`sha256=${await hmac(app,body)}`},body}),f.env,()=>{});
  assert.equal(delivery!.status,200);
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{if(String(input).includes("oauth/access_token")){assert.equal(new URLSearchParams(String(init?.body)).get("client_secret"),app);assert.ok(!String(input).includes(app));return Response.json({access_token:"verified-app-token"});}assert.equal(new Headers(init?.headers).get("authorization"),"Bearer verified-app-token");return Response.json({id:"platform",name:"Test app"});});
  assert.equal((await checkOperatorApp(f.env,"verified-operator")).appVerified,true);
});

test("expired OAuth redirects to a clean restart page without exchanging a code or creating a grant",async(t)=>{
  const f=await fixture();const start=await startOAuth(f.env,"alice",f.brandId);
  f.sql.prepare("UPDATE social_oauth SET expires_at=?").run(Date.now()-1);let calls=0;
  t.mock.method(globalThis,"fetch",async()=>{calls++;throw new Error("must not exchange");});
  const response=await oauthCallback(new Request(`https://senderdeck.test/oauth/social/meta/callback?state=${new URL(start.authorizationUrl).searchParams.get("state")}&code=private-provider-code`,{headers:{"x-dev-user-email":"alice"}}),f.env);
  assert.equal(response!.status,303);assert.equal(response!.headers.get("location"),"https://senderdeck.test/connect/meta?connection=restart_required");assert.doesNotMatch(response!.headers.get("location")!,/private-provider-code|state=/);assert.equal(calls,0);assert.equal(f.sql.prepare("SELECT count(*) n FROM social_grants").get()!.n,0);
});
test("maintenance freshness rejects future timestamps and separates manual runs from recurring evidence",async()=>{
  const f=await fixture();f.sql.prepare("UPDATE social_runtime SET value=? WHERE key='maintenance'").run(Date.now()+60000);
  assert.equal((await maintenanceStatus(f.env)).schedulerRecent,false);assert.equal((await customerSetup(f.env,"alice",f.brandId)).canConnect,true);await startOAuth(f.env,"alice",f.brandId);
  await runHostedMaintenance(f.env,"github_dispatch");let status=await maintenanceStatus(f.env);assert.equal(status.schedulerRecent,true);assert.equal(status.backgroundScheduling,"unverified");
  await runHostedMaintenance(f.env,"github_schedule");status=await maintenanceStatus(f.env);assert.equal(status.backgroundScheduling,"recent");
  f.sql.prepare("UPDATE social_runtime SET value=? WHERE key IN ('maintenance','maintenance_scheduled')").run(Date.now()-1200001);
  status=await maintenanceStatus(f.env);assert.equal(status.backgroundScheduling,"stale");assert.equal((await customerSetup(f.env,"alice",f.brandId)).canConnect,true);
});
test("direct hosted maintenance requires a verified operator and purpose-bound session CSRF",async()=>{
  const f=await operatorFixture();
  const setup=await handleSocial(new Request("https://senderdeck.test/api/social/operator/setup",{headers:f.headers}),f.env,()=>{});
  const csrf=(await setup!.json() as {maintenanceCsrfToken:string}).maintenanceCsrfToken;
  const request=(changes:Record<string,string>={})=>new Request("https://senderdeck.test/api/social/operator/maintenance",{method:"POST",headers:{...f.headers,"x-senderdeck-csrf":csrf,...changes},body:"{}"});
  assert.equal((await handleSocial(request({cookie:"","x-dev-user-email":"alice"}),f.env,()=>{}))!.status,403);
  assert.equal((await handleSocial(request({origin:"https://foreign.test"}),f.env,()=>{}))!.status,403);
  assert.equal((await handleSocial(request({"x-senderdeck-csrf":f.csrf}),f.env,()=>{}))!.status,403);
  const completed=await handleSocial(request(),f.env,()=>{});assert.equal(completed!.status,200);assert.equal((await completed!.json() as {source:string}).source,"operator");
  assert.equal((await operatorSetup(f.env,"verified-operator")).runtime.backgroundScheduling,"unverified");
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_platform_audit WHERE action='maintenance_run'").get()!.n,1);
  f.sql.prepare("INSERT INTO social_runtime VALUES ('maintenance_lease',?)").run(Date.now()+60000);
  assert.equal((await handleSocial(request(),f.env,()=>{}))!.status,409);
});
test("verified granular Page targets recover portfolio assets without fabricated tasks or extra scopes",async(t)=>{
  const f=await fixture();const paths:string[]=[];
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{
    const url=new URL(String(input)),path=url.pathname.replace("/v26.0/","");paths.push(path);
    if(path==="debug_token")return Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes,granular_scopes:[{scope:"pages_show_list",target_ids:["101"]}]}});
    if(path==="me/accounts")return Response.json({data:[{id:"909",name:"Unselected personal Page",access_token:"unselected-credential",tasks:["MANAGE"]}]});
    if(path==="101")return Response.json({id:"101",name:"Selected business",access_token:"direct-page-credential",instagram_business_account:{id:"202",username:"selected-business"}});
    if(path==="202")return Response.json({id:"202",username:"selected-business"});
    if(path==="101/feed")return Response.json({data:[{id:"selected-post"}]});
    if(path==="selected-post")return Response.json({id:"selected-post",message:"Root"});
    return Response.json({data:[]});
  });
  const grant=await discover(f.env,"grant-credential");assert.deepEqual(grant.candidates.map(asset=>asset.assetId),["101","202"]);assert.ok(grant.candidates.every(asset=>asset.tasks.length===0&&asset.discoverySource==="granular_target"));assert.equal(grant.diagnostics!.directResolved,1);assert.equal(grant.diagnostics!.businessManagementGranted,false);
  const account={...f.account,asset_id:"101",parent_id:"101",token:await encrypt("direct-page-credential",f.env.TOKEN_ENCRYPTION_KEY),user_token:await encrypt("grant-credential",f.env.TOKEN_ENCRYPTION_KEY)};
  const live=await validateConnection(f.env,account);assert.deepEqual(live.validation.tasks,[]);
  const caps=capabilities(f.env,{...account,status:live.status,validated_at:Date.now(),validation:JSON.stringify(live.validation)});assert.equal(caps.sendMessages,false);assert.equal(caps.messages,"unavailable");assert.equal(caps.replyComments,false);assert.equal(caps.comments,"available");
  assert.ok(!paths.includes("909"));
});
test("direct discovery rejects mismatched asset IDs and credential ownership without reflecting credentials",async(t)=>{
  const f=await fixture();let mismatch=true;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{
    const url=new URL(String(input)),path=url.pathname.replace("/v26.0/","");
    if(path==="debug_token")return Response.json({data:{app_id:"platform",is_valid:true,user_id:url.searchParams.get("input_token")==="wrong-owner-credential"?"another-user":"meta-user",scopes,granular_scopes:[{scope:"pages_show_list",target_ids:["101"]}]}});
    if(path==="me/accounts")return Response.json({data:[]});
    return Response.json({id:mismatch?"999":"101",access_token:"wrong-owner-credential"});
  });
  for(const state of [true,false]){mismatch=state;const grant=await discover(f.env,"grant-credential");assert.equal(grant.candidates.length,0);assert.equal(grant.diagnostics!.directUnresolved,1);assert.doesNotMatch(JSON.stringify(grant.diagnostics),/wrong-owner-credential|grant-credential|another-user/);}
});

test("unsupported optional post field retries minimal context without granting comment write ownership",async(t)=>{
  const f=await fixture();const seen:string[]=[];
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{
    const url=new URL(String(input));seen.push(url.searchParams.get("fields")||"");
    if(url.pathname.endsWith("/post")&&url.searchParams.get("fields")?.includes("can_comment"))return Response.json({error:{code:100,message:"Tried accessing nonexisting field (can_comment) on node type (Post). private-page-token"}},{status:400});
    if(url.pathname.endsWith("/post"))return Response.json({id:"post",message:"Post context"});
    return Response.json({data:[{id:"comment",message:"Comment",from:{id:"person"},created_time:new Date().toISOString()}]});
  });
  const history=await readHistory(f.env,f.account,{...f.thread,kind:"comment",provider_id:"post",target:"post"});
  assert.equal(history.items.length,2);assert.equal(history.owned,false);assert.ok(seen.includes("id,message,from,created_time"));assert.doesNotMatch(JSON.stringify(history),/private-page-token/);
  assert.equal(history.replyAuthority?.state,"unverified");assert.equal(history.ownership?.state,"unverified");assert.equal(history.coverage.complete,false);
  assert.ok(assess(defaultProfile(),"Hello",history).blockers.includes("thread_owned_by_another_application_or_unknown"));
});
test("root-list success with denied comment edge does not advertise comment history access",async(t)=>{
  const f=await fixture();provider(t);const base=globalThis.fetch;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=new URL(String(input)).pathname;
    if(path.endsWith("page-a/feed"))return Response.json({data:[{id:"post"}]});
    if(path.endsWith("/post"))return Response.json({id:"post",message:"Context",can_comment:true});
    if(path.endsWith("post/comments"))return Response.json({error:{code:200,message:"private-user-token should never be reflected"}},{status:403});
    return base(input,init);
  });
  const live=await validateConnection(f.env,f.account);
  assert.equal(live.validation.reads.commentRoots,true);assert.equal(live.validation.reads.comments,false);assert.ok(live.validation.errors.some(error=>error.includes("http_403:graph_200")));assert.doesNotMatch(JSON.stringify(live.validation),/private-user-token/);
  const caps=capabilities(f.env,{...f.account,status:live.status,validation:JSON.stringify(live.validation),validated_at:Date.now()});assert.equal(caps.comments,"unavailable");
});

test("empty message roots are unverified sample absence, not a provider denial", async t => {
  const f = await fixture(); provider(t); const original = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => new URL(String(input)).pathname.endsWith("page-a/conversations") ? Response.json({ data: [] }) : original(input, init));
  const live = await validateConnection(f.env, f.account);
  assert.equal(live.validation.reads.messageRoots, true); assert.equal(live.validation.reads.messages, false);
  assert.deepEqual(live.validation.probes.messages, { state: "unverified", stage: "roots", reason: "no_sample_root" });
  assert.ok(live.validation.errors.includes("messages_history_probe_failed:no_sample_root"));
});

test("updating a Meta asset preserves its account ID, conversations and monitoring preferences", async t => {
  const f = await fixture(); provider(t);
  f.sql.prepare("UPDATE social_accounts SET monitoring=?,last_reconciled_at=123 WHERE id=?").run('{"enabled":true,"intervalMinutes":30}', f.account.id);
  const grant = { userToken: "user-token", providerUserId: "meta-user", permissions: scopes, candidates: [], expiresAt: Date.now() + 60000 };
  f.sql.prepare("INSERT INTO social_grants (id,user_id,brand_id,encrypted,expires_at) VALUES ('refresh',?,?,?,?)").run("alice", f.brandId, await encrypt(JSON.stringify(grant), f.env.TOKEN_ENCRYPTION_KEY), Date.now() + 60000);
  const updated = await selectAsset(f.env, "alice", f.brandId, "refresh", "facebook", "page-a");
  assert.equal(updated.accountId, f.account.id);
  const saved = f.sql.prepare("SELECT monitoring,last_reconciled_at FROM social_accounts WHERE id=?").get(f.account.id)!;
  assert.equal(JSON.parse(String(saved.monitoring)).enabled, true); assert.equal(saved.last_reconciled_at, 123);
  assert.equal(f.sql.prepare("SELECT account_id FROM social_threads WHERE id=?").get(f.thread.id)!.account_id, f.account.id);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_accounts").get()!.n, 1);
  assert.equal(updated.eventSubscription,"pending");
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_notices WHERE reason='page_subscription_setup_pending'").get()!.n,1);
});

test("connecting a Page without maintenance installs only that Page's subscription and preserves existing fields",async t=>{
  const f=await fixture();provider(t);const base=globalThis.fetch;const posts:string[]=[];
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(String(input));if(url.pathname.endsWith("page-a/subscribed_apps")){if(init?.method==="POST"){posts.push(url.pathname);const fields=new URLSearchParams(String(init.body)).get("subscribed_fields")!.split(",");assert.deepEqual(fields.sort(),["feed","messages","ratings"]);return Response.json({success:true});}return Response.json({data:[{id:"platform",subscribed_fields:["messages","feed","ratings"]}]});}return base(input,init);});
  f.sql.prepare("DELETE FROM social_runtime").run();
  const grant={userToken:"user-token",providerUserId:"meta-user",permissions:scopes,candidates:[],expiresAt:Date.now()+60000};
  f.sql.prepare("INSERT INTO social_grants (id,user_id,brand_id,encrypted,expires_at) VALUES ('auto',?,?,?,?)").run("alice",f.brandId,await encrypt(JSON.stringify(grant),f.env.TOKEN_ENCRYPTION_KEY),Date.now()+60000);
  const result=await selectAsset({...f.env,SOCIAL_SCHEDULER_ENABLED:"false"},"alice",f.brandId,"auto","facebook","page-a");
  assert.equal(result.eventSubscription,"verified");assert.equal(posts.length,1);assert.equal((await maintenanceStatus(f.env)).backgroundScheduling,"unverified");
  f.sql.prepare("UPDATE social_grants SET expires_at=0 WHERE id='auto'").run();const prior=posts.length;await assert.rejects(selectAsset(f.env,"alice",f.brandId,"auto","facebook","page-a"),/expired/);assert.equal(posts.length,prior);
});

test("empty message history cannot pass the full message-detail probe", async t => {
  const f = await fixture(); provider(t); const original = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => new URL(String(input)).pathname.endsWith("conversation-a/messages") ? Response.json({ data: [] }) : original(input, init));
  const live = await validateConnection(f.env, f.account);
  assert.equal(live.validation.reads.messages, false);
  assert.deepEqual(live.validation.probes.messages, { state: "unverified", stage: "history", reason: "no_sample_message" });
});

test("a denied message detail reports its stage and safe provider codes without raw content", async t => {
  const f = await fixture(); provider(t); const original = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => new URL(String(input)).pathname.endsWith("message-0") ? Response.json({ error: { code: 200, message: "private-token confidential provider text" } }, { status: 403 }) : original(input, init));
  const live = await validateConnection(f.env, f.account);
  assert.deepEqual(live.validation.probes.messages, { state: "failed", stage: "item", reason: "provider_error", httpStatus: 403, providerCode: 200 });
  assert.doesNotMatch(JSON.stringify(live.validation), /private-token|confidential provider text/);
});

test("successful history with absent Page tasks remains blocked with an explicit reason", async t => {
  const f = await fixture(); provider(t); const original = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => new URL(String(input)).pathname.endsWith("me/accounts") ? Response.json({ data: [{ id: "page-a", access_token: "page-token", tasks: [] }] }) : original(input, init));
  const live = await validateConnection(f.env, f.account);
  assert.equal(live.validation.reads.messages, true);
  assert.equal(live.validation.taskDiscovery.state, "unverified");
  const caps = capabilities(f.env, { ...f.account, status: live.status, validation: JSON.stringify(live.validation) });
  assert.equal(caps.messages, "unavailable"); assert.equal(caps.sendMessages, false);
  assert.deepEqual(caps.messageBlockers, ["page_messaging_task_unverified"]);
});
test("older root-only validation cannot continue advertising history capabilities",async()=>{
  const f=await fixture();const validation=JSON.parse(f.account.validation);delete validation.historyProbeVersion;
  const caps=capabilities(f.env,{...f.account,validation:JSON.stringify(validation)});assert.equal(caps.comments,"unavailable");assert.equal(caps.messages,"unavailable");assert.equal(caps.needsValidation,true);
});
test("comment root listing is explicitly separate from reading comment history",async(t)=>{
  const f=await fixture();t.mock.method(globalThis,"fetch",async()=>Response.json({data:[{id:"post"}]}));
  const roots=await inbox(f.env,f.account,"comment");assert.equal(roots.threads.length,1);assert.equal(roots.coverage.complete,false);assert.ok(roots.coverage.gaps.includes("root_list_only_comment_history_requires_separate_read"));
});
test("Instagram ordered comments use the user grant and retain cross-placement comments and paged replies",async(t)=>{
  const f=await fixture();const paths:string[]=[];
  const account:SocialAccount={...f.account,provider:"instagram"};
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const u=new URL(String(input));const p=u.pathname.replace("/v26.0/","");paths.push(p);
    assert.equal(new Headers(init?.headers).get("authorization"),"Bearer user-token");
    if(p==="media-root")return Response.json({id:"media-root",owner:{id:account.asset_id},caption:"Context"});
    if(p==="media-root/ordered_comments")return Response.json({data:[{id:"placement-comment",text:"Other ad placement",from:{id:"customer",username:"commenter"},timestamp:"2026-10-24T00:00:00Z"}]});
    if(p==="placement-comment/replies"&&!u.searchParams.has("after"))return Response.json({data:[{id:"r1",text:"First reply"}],paging:{next:"https://graph.facebook.com/v26.0/placement-comment/replies?after=next"}});
    if(p==="placement-comment/replies")return Response.json({data:[{id:"r2",text:"Second reply"}]});
    throw new Error(`Unexpected endpoint ${p}`);
  });
  const history=await readHistory(f.env,account,{...f.thread,kind:"comment",provider_id:"media-root",target:"media-root"});
  assert.ok(history.items.some(i=>i.id==="placement-comment"&&i.senderName==="commenter"));
  assert.deepEqual(history.items.filter(i=>i.parentId==="placement-comment").map(i=>i.id),["r1","r2"]);
  assert.equal(paths.filter(p=>p==="placement-comment/replies").length,2);
  assert.ok(!paths.includes("media-root/comments"));assert.equal(history.nextCursor,null);
  assert.equal(history.coverage.complete,false);
  assert.ok(history.coverage.gaps.includes("ordered_comments_parent_root_is_requested_context_not_verified_media_placement"));
});

test("Instagram per-thread reads preserve the native Suite coverage uncertainty",async(t)=>{
  const f=await fixture();t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>new URL(String(input)).pathname.endsWith("/media-root")?Response.json({id:"media-root",caption:"Root",timestamp:new Date().toISOString()}):Response.json({data:[]}));
  const history=await readHistory(f.env,{...f.account,provider:"instagram"},{...f.thread,kind:"comment",provider_id:"media-root",target:"media-root"});
  assert.equal(history.coverage.complete,false);assert.ok(history.coverage.gaps.includes("instagram_native_suite_history_coverage_not_established"));
  assert.equal(history.lastInboundAt,null);assert.equal(history.items[0].role,"post_context");assert.equal(history.items[0].from,"unknown");assert.equal(history.ownership?.state,"unverified");assert.equal(history.owned,false);
});

test("comment discovery returns bounded previews, incoming activity and account-bound token-free cursors",async(t)=>{
  const f=await fixture();const at="2026-10-23T12:00:00Z";let roots=0;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{
    const u=new URL(String(input));
    assert.equal(u.searchParams.has("access_token"),false);
    if(u.pathname.endsWith("/feed")) { roots++;assert.equal(u.searchParams.get("limit"),"2");return Response.json({data:[{id:roots===1?"post":"older",message:"Our caption"}],...(roots===1?{paging:{next:"https://graph.facebook.com/v26.0/page-a/feed?after=next&limit=2&access_token=provider-secret"}}:{})}); }
    return Response.json({data:[{id:"incoming",message:"Customer question",from:{id:"person",name:"Customer"},created_time:at},{id:"own",message:"Our reply",from:{id:"page-a"},created_time:"2026-10-24T12:00:00Z"}]});
  });
  const first=await inbox(f.env,f.account,"comment",{limit:2});
  assert.equal(roots,1);assert.equal(first.threads[0].lastInboundAt,Date.parse(at));assert.equal(first.threads[0].preview[0].senderName,"Customer");
  assert.equal(first.threads[0].context.text,"Our caption");assert.ok(first.nextCursor);
  const payload=await decrypt(first.nextCursor!,f.env.TOKEN_ENCRYPTION_KEY);assert.doesNotMatch(payload,/provider-secret|access_token/);
  await assert.rejects(inbox(f.env,{...f.account,id:"another-account"},"comment",{cursor:first.nextCursor!}),/differently scoped/);
  await assert.rejects(inbox(f.env,f.account,"message",{cursor:first.nextCursor!}),/differently scoped/);
  const second=await inbox(f.env,f.account,"comment",{cursor:first.nextCursor!});assert.equal(second.nextCursor,null);assert.equal(roots,2);
  assert.ok(first.coverage.gaps.includes("promoted_and_unpublished_ad_comments_not_verified_use_meta_business_suite"));
});

test("comment reads ignore unknown ownership for activity and preserve explicit parent context",async(t)=>{
  const f=await fixture();const at="2026-10-23T12:00:00Z";
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>new URL(String(input)).pathname.endsWith("/post")?Response.json({id:"post",message:"Own recent caption",created_time:"2026-10-24T12:00:00Z",can_comment:true}):Response.json({data:[{id:"unknown",message:"No author supplied",created_time:"2026-10-24T13:00:00Z"},{id:"known",message:"Question",from:{id:"customer"},created_time:at}]}));
  const history=await readHistory(f.env,f.account,{...f.thread,kind:"comment",provider_id:"post",target:"post"});
  assert.equal(history.lastInboundAt,Date.parse(at));assert.equal(history.items.find(i=>i.id==="known")!.parentId,"post");
});

test("large comment trees stop at twelve pages and resume without making partial snapshots sendable",async(t)=>{
  const f=await fixture();const thread={...f.thread,kind:"comment" as const,provider_id:"post",target:"post"};let calls=0;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{
    calls++;const u=new URL(String(input));if(u.pathname.endsWith("/post"))return Response.json({id:"post",message:"Root",can_comment:true});
    const page=Number(u.searchParams.get("after")||0);
    return Response.json({data:[{id:`c${page}`,message:`Comment ${page}`,from:{id:"customer"}}],...(page<15?{paging:{next:`https://graph.facebook.com/v26.0/post/comments?after=${page+1}`}}:{})});
  });
  const first=await readHistory(f.env,f.account,thread);assert.equal(first.coverage.pages,12);assert.equal(calls,13);assert.ok(first.nextCursor);assert.equal(first.coverage.complete,false);
  const second=await readHistory(f.env,f.account,thread,{cursor:first.nextCursor!});assert.equal(second.nextCursor,null);assert.equal(second.coverage.pages,4);assert.equal(second.coverage.complete,false);assert.ok(second.items.some(i=>i.id==="c15"));
  assert.ok(assess(defaultProfile(),"Hello",second).blockers.includes("incomplete_history"));
  await assert.rejects(readHistory(f.env,f.account,{...thread,id:"wrong-thread"},{cursor:first.nextCursor!}),/differently scoped/);
});

test("comment discovery stops provider preview work when the shared time budget is exhausted",async(t)=>{
  const f=await fixture();const real=Date.now();let elapsed=0;let calls=0;
  t.mock.method(Date,"now",()=>real+elapsed);
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{calls++;const u=new URL(String(input));if(u.pathname.endsWith("/feed"))return Response.json({data:[{id:"a"},{id:"b"},{id:"c"}]});elapsed+=21000;return Response.json({data:[]});});
  const result=await inbox(f.env,f.account,"comment");assert.equal(calls,2);assert.equal(result.threads[1].previewError,"read_budget_reached");assert.equal(result.coverage.complete,false);
});

test("inbox previews do not reuse legacy caption timestamps as incoming activity",async(t)=>{
  const f=await fixture();f.sql.prepare("UPDATE social_threads SET kind='comment',provider_id='post',last_inbound_at=? WHERE id=?").run(Date.now(),f.thread.id);
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>new URL(String(input)).pathname.endsWith("/feed")?Response.json({data:[{id:"post",message:"Our caption"}]}):Response.json({data:[]}));
  const result=await socialAction("social_inbox",{...f.scope,kind:"comments"},f.env,"alice") as {threads:Array<{id:string;last_inbound_at:number|null;activityScope:string}>};
  assert.equal(result.threads[0].last_inbound_at,null);assert.match(result.threads[0].activityScope,/preview_only/);
  assert.equal(f.sql.prepare("SELECT last_inbound_at FROM social_threads WHERE id=?").get(f.thread.id)!.last_inbound_at,null);
});

test("verified Page authorship does not turn unavailable reply authority into permission",async(t)=>{
  const f=await fixture();
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{
    const u=new URL(String(input));if(u.pathname.endsWith("/post")) {
      if(u.searchParams.get("fields")?.includes("can_comment"))return Response.json({error:{code:100,message:"Tried accessing nonexisting field (can_comment) on node type (Post)."}},{status:400});
      return Response.json({id:"post",from:{id:"page-a"},message:"Own post"});
    }
    return Response.json({data:[]});
  });
  const history=await readHistory(f.env,f.account,{...f.thread,kind:"comment",provider_id:"post",target:"post"});
  assert.equal(history.ownership?.state,"verified");assert.equal(history.ownership?.ownerId,"page-a");assert.equal(history.items[0].from,"page-a");
  assert.equal(history.owned,false);assert.equal(history.replyAuthority?.state,"unverified");assert.equal(history.coverage.complete,false);assert.match(history.ownedMeaning!,/not proof of post authorship/);
  assert.ok(assess(defaultProfile(),"Hello",history).blockers.includes("thread_owned_by_another_application_or_unknown"));
});

test("different provider author is not replaced by the selected account or granted reply ownership",async(t)=>{
  const f=await fixture();
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>new URL(String(input)).pathname.endsWith("/post")?Response.json({id:"post",from:{id:"another-page"},message:"Another author",can_comment:true}):Response.json({data:[]}));
  const history=await readHistory(f.env,f.account,{...f.thread,kind:"comment",provider_id:"post",target:"post"});
  assert.equal(history.items[0].from,"another-page");assert.equal(history.ownership?.state,"different_asset");assert.equal(history.owned,false);assert.equal(history.coverage.complete,false);
});

test("Page ad roots use a distinct endpoint and cursor scope with actionable coverage diagnostics",async(t)=>{
  const f=await fixture();let ads=0;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{
    const u=new URL(String(input));assert.doesNotMatch(u.pathname,/\/feed$/);
    if(u.pathname.endsWith("/ads_posts")){ads++;return Response.json({data:[{id:"ad-post"}],paging:{next:"https://graph.facebook.com/v26.0/page-a/ads_posts?after=next&limit=2"}});}
    return Response.json({data:[]});
  });
  const result=await inbox(f.env,f.account,"comment",{source:"ads",limit:2});assert.equal(ads,1);assert.equal(result.source,"page_ads_posts");assert.equal(result.threads[0].providerId,"ad-post");
  assert.equal(result.coverageDiagnostics.adCreativeDiscovery.hasReadScope,false);assert.ok(result.coverageDiagnostics.adCreativeDiscovery.blockers.includes("ads_read_or_ads_management_not_granted"));
  await assert.rejects(inbox(f.env,f.account,"comment",{cursor:result.nextCursor!}),/differently scoped/);
  await assert.rejects(inbox(f.env,{...f.account,provider:"instagram"},"comment",{source:"ads"}),/source ad_creatives/);
  await inbox(f.env,f.account,"comment",{source:"ads",cursor:result.nextCursor!,limit:1});assert.equal(ads,2);
});

test("denied Page ad discovery is a specific access failure, never empty coverage",async(t)=>{
  const f=await fixture();t.mock.method(globalThis,"fetch",async()=>Response.json({error:{code:200,message:"private provider text"}},{status:403}));
  await assert.rejects(inbox(f.env,f.account,"comment",{source:"ads"}),error=>error instanceof Error&&/ads_posts read failed: HTTP 403, Graph 200/.test(error.message)&&!error.message.includes("private provider text"));
});

async function advertisingFixture() {
  const f=await fixture();
  const grant={userToken:"advertising-user-token",providerUserId:"meta-user",permissions:[...scopes,"ads_read"],candidates:[],expiresAt:null};
  f.sql.prepare("INSERT INTO social_grants (id,brand_id,user_id,encrypted,expires_at) VALUES ('ad-grant',?,'alice',?,?)").run(f.brandId,await encrypt(JSON.stringify(grant),f.env.TOKEN_ENCRYPTION_KEY),Date.now()+60000);
  return {...f,confirmation:`Select advertising account act_123 for social account ${f.account.id} in brand ${f.brandId}`};
}
test("advertising discovery and selection require live scope and separate exact owner confirmation",async(t)=>{
  const f=await advertisingFixture();let adsCalls=0;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{const u=new URL(String(input));if(u.pathname.endsWith("/debug_token"))return Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes}});adsCalls++;return Response.json({data:[]});});
  await assert.rejects(selectAdvertisingAccount(f.env,"alice",f.brandId,"ad-grant",f.account.id,"act_123",false,f.confirmation),/Separate owner confirmation/);
  await assert.rejects(selectAdvertisingAccount(f.env,"alice",f.brandId,"ad-grant",f.account.id,"act_123",true,"wrong"),/Separate owner confirmation/);
  await assert.rejects(grantAssets(f.env,"alice",f.brandId,"ad-grant","advertising"),/ads_read grant/);
  await assert.rejects(selectAdvertisingAccount(f.env,"alice",f.brandId,"ad-grant",f.account.id,"act_123",true,f.confirmation),/ads_read grant/);
  assert.equal(adsCalls,0);assert.equal(JSON.parse(String(f.sql.prepare("SELECT validation FROM social_accounts WHERE id=?").get(f.account.id)!.validation)).advertisingAccount,undefined);
});
test("advertising selection stays user/brand/role bound and rejects an altered granting identity",async(t)=>{
  const f=await advertisingFixture();
  t.mock.method(globalThis,"fetch",async()=>Response.json({data:{app_id:"platform",is_valid:true,user_id:"another-person",scopes:[...scopes,"ads_read"]}}));
  await assert.rejects(selectAdvertisingAccount(f.env,"bob",f.brandId,"ad-grant",f.account.id,"act_123",true,f.confirmation),/not found/);
  await assert.rejects(selectAdvertisingAccount(f.env,"alice","wrong-brand","ad-grant",f.account.id,"act_123",true,f.confirmation),/not found/);
  await assert.rejects(selectAdvertisingAccount(f.env,"alice",f.brandId,"ad-grant",f.account.id,"act_123",true,f.confirmation),/identity does not match/);
  f.sql.prepare("UPDATE social_grants SET user_id='someone-else'").run();
  await assert.rejects(selectAdvertisingAccount(f.env,"alice",f.brandId,"ad-grant",f.account.id,"act_123",true,f.confirmation),/expired or was not found/);
  f.sql.prepare("UPDATE social_members SET role='viewer' WHERE user_id='alice'").run();
  await assert.rejects(selectAdvertisingAccount(f.env,"alice",f.brandId,"ad-grant",f.account.id,"act_123",true,f.confirmation),/role/);
});
test("confirmed advertising selection validates the exact account and preserves sending and Page credentials",async(t)=>{
  const f=await advertisingFixture();const profile=String(f.sql.prepare("SELECT profile FROM social_brands WHERE id=?").get(f.brandId)!.profile);
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    assert.equal(init?.method,"GET");const u=new URL(String(input));
    if(u.pathname.endsWith("debug_token"))return Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes:[...scopes,"ads_read"]}});
    if(u.pathname.endsWith("me/adaccounts"))return Response.json({data:[{id:"act_123",name:"Approved advertising",account_status:1}],paging:{next:"https://graph.facebook.com/v26.0/me/adaccounts?after=more",cursors:{after:"more"}}});
    assert.ok(u.pathname.endsWith("/act_123"));return Response.json({id:"act_123",name:"Approved advertising",account_status:1});
  });
  const listed=await grantAssets(f.env,"alice",f.brandId,"ad-grant","advertising");assert.equal(listed.assets[0].assetId,"act_123");assert.doesNotMatch(JSON.stringify(listed),/advertising-user-token/);
  const selected=await selectAdvertisingAccount(f.env,"alice",f.brandId,"ad-grant",f.account.id,"act_123",true,f.confirmation);assert.equal(selected.sendingPolicyChanged,false);
  const saved=await accountFor(f.env,"alice",f.brandId,f.account.id);assert.equal(saved.account.token,f.account.token);assert.equal(await decrypt(saved.account.user_token!,f.env.TOKEN_ENCRYPTION_KEY),"advertising-user-token");
  assert.equal(JSON.parse(saved.account.validation).advertisingAccount.id,"act_123");assert.equal(String(f.sql.prepare("SELECT profile FROM social_brands WHERE id=?").get(f.brandId)!.profile),profile);
});
test("unapproved ad-creative mapping never reads an advertising endpoint",async(t)=>{
  const f=await fixture();let calls=0;t.mock.method(globalThis,"fetch",async()=>{calls++;throw Error("should not fetch");});
  await assert.rejects(inbox(f.env,f.account,"comment",{source:"ad_creatives"}),/explicitly approved/);assert.equal(calls,0);
});
test("creative mapping verifies Instagram root owners, deduplicates and scopes resumable pages",async(t)=>{
  const f=await fixture();const validation=JSON.stringify({...JSON.parse(f.account.validation),advertisingAccount:{id:"act_123",name:"Approved",selectedAt:123,selectedBy:"alice"}});
  const account={...f.account,provider:"instagram" as const,asset_id:"ig-a",validation,permissions:JSON.stringify([...scopes,"ads_read"])};
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const u=new URL(String(input));assert.equal(init?.method,"GET");assert.equal(u.searchParams.has("access_token"),false);
    if(u.pathname.endsWith("debug_token"))return Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes:[...scopes,"ads_read"]}});
    if(u.pathname.endsWith("/act_123"))return Response.json({id:"act_123",name:"Approved"});
    if(u.pathname.endsWith("/adcreatives"))return Response.json(u.searchParams.has("after")?{data:[{id:"c4",effective_instagram_media_id:"103"}]}:{data:[{id:"c1",effective_instagram_media_id:"101"},{id:"c2",effective_instagram_media_id:"102"},{id:"c3",effective_instagram_media_id:"101"}],paging:{next:"https://graph.facebook.com/v26.0/act_123/adcreatives?after=more&access_token=provider-secret"}});
    if(u.pathname.endsWith("/comments"))return Response.json({data:[]});
    const id=u.pathname.split("/").at(-1)!;return Response.json({id,owner:{id:id==="102"?"other-customer":"ig-a"},caption:id==="102"?"FOREIGN PRIVATE CAPTION":"Selected brand",permalink:"https://instagram.example/owned"});
  });
  const first=await inbox(f.env,account,"comment",{source:"ad_creatives"});assert.deepEqual(first.threads.map(t=>t.providerId),["101"]);assert.equal(first.source,"selected_ad_account_creatives");assert.ok(first.nextCursor);
  assert.doesNotMatch(JSON.stringify(first),/FOREIGN PRIVATE CAPTION|provider-secret/);assert.doesNotMatch(await decrypt(first.nextCursor!,f.env.TOKEN_ENCRYPTION_KEY),/provider-secret|access_token/);
  const second=await inbox(f.env,account,"comment",{source:"ad_creatives",cursor:first.nextCursor!});assert.deepEqual(second.threads.map(t=>t.providerId),["103"]);assert.equal(second.nextCursor,null);
  await assert.rejects(inbox(f.env,{...account,validation:validation.replace('"selectedAt":123','"selectedAt":124')},"comment",{source:"ad_creatives",cursor:first.nextCursor!}),/differently scoped/);
});
test("creative Facebook story mapping uses Page credentials and actual post authorship",async(t)=>{
  const f=await fixture();const account={...f.account,asset_id:"100",parent_id:"100",validation:JSON.stringify({...JSON.parse(f.account.validation),advertisingAccount:{id:"act_123",selectedAt:1}})};
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(String(input));
    if(u.pathname.endsWith("debug_token"))return Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes:[...scopes,"ads_read"]}});
    if(u.pathname.endsWith("/act_123"))return Response.json({id:"act_123"});
    if(u.pathname.endsWith("/adcreatives"))return Response.json({data:[{id:"c1",effective_object_story_id:"100_9"}]});
    assert.equal(new Headers(init?.headers).get("authorization"),"Bearer page-token");
    return u.pathname.endsWith("/100_9")?Response.json({id:"100_9",from:{id:"100"},message:"Verified story"}):Response.json({data:[]});
  });
  const result=await inbox(f.env,account,"comment",{source:"ad_creatives"});assert.equal(result.threads[0].providerId,"100_9");
});
test("revoked advertising scope stops creative mapping before account or media access",async(t)=>{
  const f=await fixture();const account={...f.account,validation:JSON.stringify({...JSON.parse(f.account.validation),advertisingAccount:{id:"act_123",selectedAt:1}})};let calls=0;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{calls++;assert.ok(String(input).includes("debug_token"));return Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes}});});
  await assert.rejects(inbox(f.env,account,"comment",{source:"ad_creatives"}),/ads_read grant/);assert.equal(calls,1);
});

test("creative root verification failures resume at the unprocessed root without dropping it",async(t)=>{
  const f=await fixture();const account={...f.account,provider:"instagram" as const,asset_id:"ig-a",validation:JSON.stringify({...JSON.parse(f.account.validation),advertisingAccount:{id:"act_123",selectedAt:1}})};let fail=true;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{const u=new URL(String(input));
    if(u.pathname.endsWith("debug_token"))return Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes:[...scopes,"ads_read"]}});
    if(u.pathname.endsWith("/act_123"))return Response.json({id:"act_123"});
    if(u.pathname.endsWith("/adcreatives"))return Response.json({data:[{id:"c1",effective_instagram_media_id:"101"},{id:"c2",effective_instagram_media_id:"102"}]});
    if(u.pathname.endsWith("/comments"))return Response.json({data:[]});
    const id=u.pathname.split("/").at(-1)!;if(id==="102"&&fail)throw Error("private provider failure");return Response.json({id,owner:{id:"ig-a"},caption:"Owned"});
  });
  const first=await inbox(f.env,account,"comment",{source:"ad_creatives"});assert.deepEqual(first.threads.map(t=>t.providerId),["101"]);assert.ok(first.nextCursor);assert.equal(first.coverage.complete,false);
  fail=false;const second=await inbox(f.env,account,"comment",{source:"ad_creatives",cursor:first.nextCursor!});assert.deepEqual(second.threads.map(t=>t.providerId),["102"]);assert.equal(second.nextCursor,null);
});

test("advertising selection refuses reduced social scopes and mismatched account IDs without replacing credentials",async(t)=>{
  const f=await advertisingFixture();let reduced=true;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>String(input).includes("debug_token")?Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes:reduced?["ads_read"]:[...scopes,"ads_read"]}}):Response.json({id:"act_999",name:"Wrong account"}));
  await assert.rejects(selectAdvertisingAccount(f.env,"alice",f.brandId,"ad-grant",f.account.id,"act_123",true,f.confirmation),/retain the existing social permissions/);
  reduced=false;await assert.rejects(selectAdvertisingAccount(f.env,"alice",f.brandId,"ad-grant",f.account.id,"act_123",true,f.confirmation),/identity was not verified/);
  const saved=(await accountFor(f.env,"alice",f.brandId,f.account.id)).account;assert.equal(saved.user_token,f.account.user_token);assert.equal(saved.permissions,f.account.permissions);
});
