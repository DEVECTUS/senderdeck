/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic provider responses vary by endpoint; no production types are loosened. */
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import type {TestContext} from "node:test";
import type {Env,D1PreparedStatement,WorkerD1Database} from "../worker/env";
import {socialAction} from "../worker/social/service";
import {encrypt} from "../worker/crypto";
import {channels,sydneyTime,type PublishChannel} from "../worker/social/publishing-model";
import {hexHash} from "../worker/social/publishing-media";
import {requiredPublishScopes} from "../worker/social/publishing-providers";
export async function fixture(t:TestContext){
 const sql=new DatabaseSync(":memory:");sql.exec("PRAGMA foreign_keys=ON");
 for(const file of readdirSync(new URL("../drizzle/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort())sql.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),"utf8"));
 const records=new WeakMap<object,{q:string;v:unknown[]}>();
 const wrap=(q:string,v:unknown[]=[]):D1PreparedStatement=>{const s:D1PreparedStatement={bind:(...args)=>wrap(q,args),async first<T>(){return sql.prepare(q).get(...v as never[]) as T||null;},async all<T>(){return {success:true,results:sql.prepare(q).all(...v as never[]) as T[]};},async run<T>(){return {success:true,results:[] as T[],meta:{changes:sql.prepare(q).run(...v as never[]).changes}};}};records.set(s,{q,v});return s;};
 const DB:WorkerD1Database={prepare:wrap,async batch<T>(items:D1PreparedStatement[]){sql.exec("BEGIN");try{const out=items.map(s=>{const r=records.get(s)!;return {success:true,results:sql.prepare(r.q).all(...r.v as never[]) as T[]};});sql.exec("COMMIT");return out;}catch(e){sql.exec("ROLLBACK");throw e;}}};
 const env:Env={DB,TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,9).toString("base64"),META_APP_ID:"platform",META_LOGIN_CONFIG_ID:"synthetic-login-config",META_APP_SECRET:"synthetic-app",SOCIAL_PUBLIC_ORIGIN:"https://senderdeck.test",SOCIAL_PUBLISH_ENABLED:"true",SOCIAL_SEND_ENABLED:"false",LINKEDIN_CLIENT_ID:"li-app",LINKEDIN_CLIENT_SECRET:"synthetic-li",LINKEDIN_COMMUNITY_APPROVED:"true"};
 const call=async(name:string,args:Record<string,unknown>={},user="alice"):Promise<any>=>socialAction(name,args,env,user);
 const c=await call("social_customer_create",{name:"Synthetic customer"});const b=await call("social_brand_create",{customerId:c.customerId,name:"Synthetic brand"});const brandId=b.brandId as string;
 const permissions=[...new Set(channels.flatMap(requiredPublishScopes))];
 for(const [provider,asset,parent,identity] of [["facebook","101","101","meta-user"],["instagram","202","101","meta-user"],["linkedin","303",null,"urn:li:person:synthetic"]])sql.prepare("INSERT INTO social_accounts (id,brand_id,provider,asset_id,parent_id,provider_user_id,name,token,user_token,expires_at,permissions,status,validation,validated_at,monitoring,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'connected','{}',1,'{}',?)").run(provider,brandId,provider,asset,parent,identity,provider,await encrypt(provider==="instagram"?"user-token":provider+"-token",env.TOKEN_ENCRYPTION_KEY),provider==="linkedin"?null:await encrypt("user-token",env.TOKEN_ENCRYPTION_KEY),Date.now()+86400000,JSON.stringify(permissions),Date.now());
 const options={failChannel:"",lostChannel:"",readbackFailure:false,wrongOwner:false,native:false,incomplete:false,cancelUpload:false};const writes:Array<{path:string;params:any}>=[];let next=800;const containers=new Map<string,any>(),published=new Map<string,any>();
 t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
  const u=new URL(input instanceof Request?input.url:String(input));const path=decodeURIComponent(u.pathname.replace(/^\/v26.0\//,""));const method=init?.method||"GET";assert.ok(["https://graph.facebook.com","https://api.linkedin.com","https://www.linkedin.com"].includes(u.origin),"No real external network access");assert.equal(init?.redirect,"manual");
  if(path==="/oauth/v2/accessToken")return Response.json({access_token:"synthetic-new-linkedin-token"});
  if(path==="/oauth/v2/introspectToken")return Response.json({active:true,client_id:"li-app",auth_type:"3L",expires_at:Math.floor(Date.now()/1000)+86400,scope:permissions.join(",")});
  if(path==="oauth/access_token")return Response.json({access_token:"user-token"});
  if(path==="debug_token")return Response.json({data:{is_valid:true,app_id:"platform",user_id:"meta-user",scopes:permissions,expires_at:Math.floor(Date.now()/1000)+86400}});
  if(path==="me/accounts")return Response.json({data:[{id:"101",name:"Synthetic Page",access_token:"facebook-token",tasks:["CREATE_CONTENT","MANAGE"],instagram_business_account:{id:"202"}}]});
  if(path==="101")return Response.json({id:"101",name:"Synthetic Page"});if(path==="202")return Response.json({id:"202",username:"synthetic",account_type:"BUSINESS"});
  if(path.startsWith("/rest/organizationAcls"))return Response.json({elements:[{organization:"urn:li:organization:303",roleAssignee:"urn:li:person:synthetic",role:"ADMINISTRATOR",state:"APPROVED"}]});
  if(path==="/rest/organizations/303")return Response.json({id:303,localizedName:"Synthetic company"});
  if(method==="POST"&&path==="/rest/images") {writes.push({path,params:JSON.parse(String(init?.body))});return Response.json({value:{uploadUrl:"https://www.linkedin.com/dms-uploads/synthetic",image:"urn:li:image:synthetic",uploadUrlExpiresAt:Date.now()+60000}});}
  if(method==="PUT"){assert.equal(u.pathname,"/dms-uploads/synthetic");writes.push({path,params:{}});return new Response(null,{status:201});}
  if(path==="/rest/images/urn:li:image:synthetic")return Response.json({id:"urn:li:image:synthetic",owner:options.wrongOwner?"urn:li:organization:999":"urn:li:organization:303",status:"AVAILABLE"});
  if(method==="POST"){
   const params=path.startsWith("/rest/")?JSON.parse(String(init?.body)):Object.fromEntries(new URLSearchParams(init?.body as string));writes.push({path,params});
   const ch:PublishChannel=path==="/rest/posts"?"linkedin_feed":path==="101/photo_stories"?"facebook_story":path==="101/photos"?params.published==="false"?"facebook_story":"facebook_feed":path==="202/media"?params.media_type==="STORIES"?"instagram_story":"instagram_feed":containers.get(params.creation_id)?.channel;
   if(options.failChannel===ch)return Response.json({error:{code:200}},{status:403});
   if(path==="202/media"){const id=String(++next);containers.set(id,{...params,channel:ch});if(options.cancelUpload)sql.prepare("UPDATE social_publish_items SET disposition='cancelled'").run();return Response.json({id});}
   if(path==="101/photos"&&params.published==="false")return Response.json({id:String(++next)});
   const id=path==="/rest/posts"?"urn:li:share:"+(++next):String(++next);published.set(id,{...params,channel:ch,...(params.creation_id?containers.get(params.creation_id):{})});
   if(options.lostChannel===ch)throw new Error("synthetic transport lost after publication");
   return path==="/rest/posts"?new Response(null,{status:201,headers:{"x-restli-id":id}}):Response.json(path==="101/photos"||path==="101/photo_stories"?{post_id:id}:{id});
  }
  if(containers.has(path))return Response.json({id:path,status_code:"FINISHED"});
  const native=published.get(path.startsWith("/rest/posts/")?path.slice("/rest/posts/".length):path);
  if(native){if(options.readbackFailure)return Response.json({error:{}},{status:503});const at=new Date().toISOString();if(native.channel==="linkedin_feed")return Response.json({id:path.slice("/rest/posts/".length),author:"urn:li:organization:303",lifecycleState:"PUBLISHED",commentary:native.commentary,publishedAt:Date.now(),content:native.content});if(native.channel.startsWith("instagram"))return Response.json({id:path,owner:{id:options.wrongOwner?"999":"202"},media_type:"IMAGE",media_product_type:native.channel.endsWith("story")?"STORY":"FEED",caption:native.caption,alt_text:native.alt_text,timestamp:at,permalink:"https://www.instagram.com/p/synthetic/"});return Response.json({id:path,from:{id:"101"},is_published:true,message:native.caption,created_time:at,permalink_url:"https://www.facebook.com/synthetic"});}
  if(path==="101/stories")return Response.json({data:[...published].filter(([,v])=>v.channel==="facebook_story").map(([id])=>({post_id:id,status:"PUBLISHED",creation_time:new Date().toISOString(),url:"https://www.facebook.com/stories/synthetic"}))});
  if(path==="/rest/posts")return Response.json({elements:[]});
  if(/^(101|202)\/(published_posts|scheduled_posts|media|scheduled_media|stories)$/.test(path))return Response.json({data:options.native?[{id:"999",timestamp:new Date().toISOString(),created_time:new Date().toISOString()}]:[],...(options.incomplete?{paging:{next:u.href}}:{})});
  throw new Error("Unexpected mock provider endpoint: "+path);
 });
 const scoped=(name:string,args:Record<string,unknown>={})=>call(name,{brandId,...args});
 const destinations=channels.map(channel=>({channel,accountId:channel.split("_")[0],assetId:channel.startsWith("facebook")?"101":channel.startsWith("instagram")?"202":"303"}));
 const policy={timezone:"Australia/Sydney",startDate:sydneyTime().date,destinations,approvalBasis:"Explicit synthetic owner approval for routine organic daily content",routineOnly:true,paidPromotion:false};const preview=await scoped("social_publish_policy_preview",policy);await scoped("social_publish_policy_set",{...policy,revision:0,enabled:true,confirmed:true,confirmation:preview.requiredConfirmation});
 async function upload(story=false){const bytes=new Uint8Array(32);bytes.set([255,216,255,192,0,17,8]);const v=new DataView(bytes.buffer);v.setUint16(7,story?1920:1350);v.setUint16(9,1080);const sha256=await hexHash(bytes);const started=await scoped("social_publish_media_prepare",{mime:"image/jpeg",bytes:bytes.length,sha256});await scoped("social_publish_media_chunk",{mediaId:started.mediaId,ordinal:0,base64:Buffer.from(bytes).toString("base64")});await scoped("social_publish_media_complete",{mediaId:started.mediaId});return started.mediaId as string;}
 async function prepare(selected:readonly PublishChannel[]=channels){const feed=await upload(),story=await upload(true);return scoped("social_publish_prepare",{contentKey:"synthetic-today",topicDate:sydneyTime().date,title:"Synthetic approved topic",targets:destinations.filter(d=>selected.includes(d.channel)).map(d=>({...d,caption:d.channel.endsWith("story")?"":"Approved synthetic caption",altText:"Approved artwork description",mediaId:d.channel.endsWith("story")?story:feed}))});}
 async function preflight(item:any,channel:PublishChannel){const result=await scoped("social_publish_preflight",{itemId:item.itemId,channel});if(channel==="linkedin_feed"&&!result.complete&&!options.native&&!options.incomplete)return scoped("social_publish_clearance_record",{itemId:item.itemId,channel,observedAt:Date.now(),evidence:"Synthetic native planner inspected in fixture; no scheduled content or same-date post exists",confirmed:true});return result;}
 async function release(item:any,channel:PublishChannel){return scoped("social_publish_release",{itemId:item.itemId,channel,digest:item.digest});}
 t.after(()=>sql.close());return {sql,env,brandId,call,scoped,upload,prepare,preflight,release,options,writes,permissions,destinations,published};
}
