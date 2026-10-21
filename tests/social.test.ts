import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { socialAction, readThread } from "../worker/social/service";
import { defaultProfile, assess, validateProfile } from "../worker/social/policy";
import { accountFor, brandFor, notice, safeAccount, type SocialAccount, type Thread, type History } from "../worker/social/model";
import { graphPages, readHistory, platformStatus, capabilities } from "../worker/social/meta";
import { startOAuth, oauthCallback, grantAssets, selectAsset } from "../worker/social/oauth";
import { hmac, receiveMeta, processQueue, maintenance, verifySignedRequest, metaDeletion } from "../worker/social/webhooks";
import { handleSocial } from "../worker/social/api";
import { encrypt, decrypt } from "../worker/crypto";
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
  const account:SocialAccount={id:"account-a",brand_id:created.brandId,provider:"facebook",asset_id:"page-a",parent_id:"page-a",provider_user_id:"meta-user",name:"Page A",token:await encrypt("page-token",env.TOKEN_ENCRYPTION_KEY),user_token:await encrypt("user-token",env.TOKEN_ENCRYPTION_KEY),expires_at:Date.now()+86400000,permissions:JSON.stringify(scopes),status:"connected",validation:JSON.stringify({reads:{messages:true,comments:true},tasks:["MANAGE","MESSAGING","MODERATE"]}),validated_at:Date.now(),monitoring:'{"enabled":false,"intervalMinutes":10}',last_reconciled_at:null,created_at:Date.now()};
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
    if(path==="me/accounts")return Response.json({data:[{id:"page-a",tasks:["MANAGE","MESSAGING","MODERATE"],instagram_business_account:{id:"ig-a"}}]});
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
test("missing platform and hosted maintenance keep OAuth gated",async()=>{const f=await fixture();await assert.rejects(startOAuth({...f.env,META_APP_SECRET:undefined},"alice",f.brandId),/not configured/);f.sql.prepare("DELETE FROM social_runtime").run();await assert.rejects(startOAuth(f.env,"alice",f.brandId),/maintenance/);assert.equal(platformStatus({} as Env).sending,"disabled");assert.equal(platformStatus({} as Env).linkedin.pageMessaging,"unavailable");});
test("OAuth state is user-bound, one-use and preserves the fixed callback origin",async(t)=>{
  const f=await fixture();const start=await startOAuth(f.env,"alice",f.brandId);const auth=new URL(start.authorizationUrl);assert.equal(auth.searchParams.get("redirect_uri"),"https://senderdeck.test/oauth/social/meta/callback");
  const callback=(user:string)=>new Request(`https://evil-host.test/oauth/social/meta/callback?state=${auth.searchParams.get("state")}&code=code`,{headers:{"x-dev-user-email":user}});
  await assert.rejects(oauthCallback(callback("bob"),f.env),/another session/);
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{const url=new URL(String(input));if(url.pathname.endsWith("oauth/access_token"))return Response.json({access_token:"user-token"});if(url.pathname.endsWith("debug_token"))return Response.json({data:{app_id:"platform",is_valid:true,user_id:"meta-user",scopes}});return Response.json({data:[{id:"page-a",name:"A",access_token:"page-token",tasks:["MANAGE"]}]});});
  const response=await oauthCallback(callback("alice"),f.env);assert.equal(response?.status,303);assert.match(response!.headers.get("location")!,/^https:\/\/senderdeck.test\/conversations/);
  await assert.rejects(oauthCallback(callback("alice"),f.env),/already used/);
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
