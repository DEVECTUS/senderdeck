import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { authenticatedUser, withAuthenticatedUserHeaders } from "../worker/auth";
import { handleIdentityAuthRoute } from "../worker/identity-auth";
import { requireMcpUserId } from "../worker/mcp-auth";
import { retiredUserKey, isUserRetired } from "../worker/retired-users";
import { sha256Base64Url } from "../worker/crypto";
import { socialAction } from "../worker/social/service";
import type { D1PreparedStatement, Env, WorkerD1Database } from "../worker/env";

async function fixture() {
  const sql = new DatabaseSync(":memory:"); sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(f=>f.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),"utf8"));
  const wrap=(query:string, values:unknown[]=[]):D1PreparedStatement=>({bind:(...args)=>wrap(query,args),async first<T>(){return (sql.prepare(query).get(...values as never[]) as T)||null;},async all<T>(){return {success:true,results:sql.prepare(query).all(...values as never[]) as T[]};},async run<T>(){sql.prepare(query).run(...values as never[]);return {success:true,results:[] as T[]};}});
  const DB:WorkerD1Database={prepare:wrap,async batch<T>(statements:D1PreparedStatement[]){return Promise.all(statements.map(s=>s.all<T>()));}};
  const env={DB,TOKEN_ENCRYPTION_KEY:"",META_APP_SECRET:"synthetic",META_WEBHOOK_VERIFY_TOKEN:"synthetic",OPENAI_SIGNIN_LINKS:JSON.stringify({"openai-subject":"active-provider-user"})} as Env;
  sql.exec(`INSERT INTO senderdeck_identities VALUES ('google','google-subject','active-provider-user','owner@example.test',1,1);
    INSERT INTO social_customers VALUES ('customer','Existing workspace',1);
    INSERT INTO social_members VALUES ('member','customer','active-provider-user','owner');
    INSERT INTO social_brands VALUES ('brand','customer','Existing brand','{}',1,1);
    INSERT INTO social_accounts (id,brand_id,provider,asset_id,name,token,permissions,status,validation,monitoring,created_at) VALUES ('page','brand','facebook','page-id','Existing Page','unchanged-encrypted-token','[]','limited','{}','{}',1);
    INSERT INTO social_threads (id,account_id,provider_id,kind,target,status,next_action,updated_at) VALUES ('thread','page','conversation','message','person','new','Review',1);`);
  sql.prepare("INSERT INTO social_runtime VALUES (?,?)").run(await retiredUserKey("openai-subject"),Date.now());
  sql.prepare("INSERT INTO senderdeck_sessions VALUES (?,?,?,?,?)").run(await sha256Base64Url("google-session"),"active-provider-user","owner@example.test",1,Date.now()+600000);
  const request=(id="openai-subject",extra:Record<string,string>={})=>new Request("https://senderdeck.test/accounts",{headers:{"oai-authenticated-user-id":id,"oai-authenticated-user-email":"owner@example.test",...extra}});
  return {sql,env,request};
}

test("explicit OpenAI linking resolves the same workspace as Google without changing saved records",async()=>{
  const f=await fixture();const tables=["social_accounts","social_threads","social_members","senderdeck_identities"];
  const before=tables.map(t=>f.sql.prepare(`SELECT * FROM ${t}`).all());
  const openai=await authenticatedUser(f.request(),f.env), google=await authenticatedUser(new Request("https://senderdeck.test/accounts",{headers:{cookie:"senderdeck_session=google-session"}}),f.env);
  assert.equal(openai?.userId,google?.userId);assert.equal(openai?.email,google?.email);assert.equal(openai?.source,"openai");assert.equal(google?.source,"senderdeck");
  const one=await socialAction("social_workspace_list",{},f.env,openai!.userId),two=await socialAction("social_workspace_list",{},f.env,google!.userId);assert.deepEqual(one,two);
  const accounts=await socialAction("social_account_list",{brandId:"brand"},f.env,openai!.userId) as {accounts:Array<{id:string}>};assert.equal(accounts.accounts[0].id,"page");
  assert.deepEqual(tables.map(t=>f.sql.prepare(`SELECT * FROM ${t}`).all()),before);
  const internal=await withAuthenticatedUserHeaders(f.request("openai-subject",{"x-senderdeck-user-id":"attacker"}),f.env);assert.equal(internal.headers.get("x-senderdeck-user-id"),"active-provider-user");
  f.sql.close();
});

test("linking does not infer identity from email or revive retired sessions and MCP credentials",async()=>{
  const f=await fixture();assert.equal((await authenticatedUser(f.request("another-subject"),f.env))?.userId,"another-subject");
  assert.equal(await authenticatedUser(new Request("https://senderdeck.test/",{headers:{"x-senderdeck-user-id":"openai-subject"}}),f.env),null);
  assert.equal((await authenticatedUser(new Request("https://senderdeck.test/",{headers:{"oai-authenticated-user-email":"owner@example.test"}}),f.env))?.userId,"owner@example.test");
  f.sql.prepare("INSERT INTO senderdeck_sessions VALUES (?,?,?,?,?)").run(await sha256Base64Url("old-session"),"openai-subject","owner@example.test",1,Date.now()+600000);
  assert.equal(await authenticatedUser(f.request("openai-subject",{cookie:"senderdeck_session=old-session"}),f.env),null);
  f.sql.prepare("INSERT INTO mcp_oauth_tokens VALUES (?,?,?,?,?,?,?,?)").run(await sha256Base64Url("old-access"),"access","openai-subject","client","senderdeck","https://senderdeck.test/api/mcp",Math.floor(Date.now()/1000)+600,1);
  await assert.rejects(requireMcpUserId(new Request("https://senderdeck.test/api/mcp",{headers:{authorization:"Bearer old-access"}}),f.env),/Connect SenderDeck/);
  assert.equal(await isUserRetired(f.env,"openai-subject"),true);assert.equal(await authenticatedUser(f.request(),{...f.env,OPENAI_SIGNIN_LINKS:undefined}),null);f.sql.close();
});

test("sign-in links fail closed for missing/retired destinations, malformed mappings and alias chains",async()=>{
  const f=await fixture();
  for(const value of ["not json","null","[]",'{"openai-subject":"openai-subject"}','{"openai-subject":"active-provider-user","active-provider-user":"third-user"}','{"owner@example.test":"active-provider-user"}'])await assert.rejects(authenticatedUser(f.request(),{...f.env,OPENAI_SIGNIN_LINKS:value}),/linking is unavailable/);
  assert.equal(await authenticatedUser(f.request(),{...f.env,OPENAI_SIGNIN_LINKS:'{"openai-subject":"missing"}'}),null);
  f.sql.prepare("INSERT INTO social_runtime VALUES (?,?)").run(await retiredUserKey("active-provider-user"),Date.now());assert.equal(await authenticatedUser(f.request(),f.env),null);f.sql.close();
});

test("OpenAI provider selection clears only the browser cookie and delegates safe return paths to Sites",async()=>{
  const f=await fixture();
  const response=await handleIdentityAuthRoute(new Request("https://senderdeck.test/auth/openai/start?return_to=%2Faccounts",{headers:{cookie:"senderdeck_session=google-session"}}),f.env);
  assert.equal(response?.status,303);assert.equal(response?.headers.get("location"),"https://senderdeck.test/signin-with-chatgpt?return_to=%2Faccounts");assert.match(response!.headers.get("set-cookie")!,/Max-Age=0/);assert.equal(f.sql.prepare("SELECT count(*) n FROM senderdeck_sessions").get()!.n,1);
  const unsafe=await handleIdentityAuthRoute(new Request("https://senderdeck.test/auth/openai/start?return_to=https://evil.test/"),f.env);assert.equal(new URL(unsafe!.headers.get("location")!).searchParams.get("return_to"),"/");
  assert.equal((await handleIdentityAuthRoute(new Request("https://senderdeck.test/auth/openai/start",{method:"POST"}),f.env))?.status,405);f.sql.close();
});
