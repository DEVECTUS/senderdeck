import { HttpError } from "../auth";
import type { Env } from "../env";
import { decrypt } from "../crypto";
import { discover, graph, inspectToken, GRAPH_VERSION } from "./meta";
import type { SocialAccount } from "./model";
import { isStory, providerFor, safeUrl, PublishingProviderError, sydneyTime, type PublishChannel, type PublishTarget, type Media, type ProviderReceipt } from "./publishing-model";
import { mediaBytes, providerMediaUrl } from "./publishing-media";

type ObjectData=Record<string,unknown>;
export const LINKEDIN_SCOPES=["r_organization_admin","r_organization_social","w_organization_social"];
export interface PublishGrant {token:string;account:SocialAccount;channel:PublishChannel;business:boolean;person?:string}
export function requiredPublishScopes(channel:PublishChannel) {return channel.startsWith("facebook")?["pages_manage_posts","pages_read_engagement","pages_show_list"]:channel.startsWith("instagram")?["instagram_basic","instagram_content_publish","pages_read_engagement","pages_show_list"]:LINKEDIN_SCOPES;}
export function localPublishBlockers(env:Env,account:SocialAccount,channel:PublishChannel) {
  const blockers:string[]=[];
  if(providerFor(channel)!==account.provider)blockers.push("destination_provider_mismatch");
  if(!account.token||["revoked","expired","pending_authorization"].includes(account.status))blockers.push("connected_publishing_grant_required");
  if(account.expires_at&&account.expires_at<=Date.now())blockers.push("publishing_grant_expired");
  const scopes=JSON.parse(account.permissions) as string[];
  blockers.push(...requiredPublishScopes(channel).filter(s=>!scopes.includes(s)).map(s=>`missing_scope:${s}`));
  if(account.provider==="linkedin"&&(!env.LINKEDIN_CLIENT_ID||!env.LINKEDIN_CLIENT_SECRET||env.LINKEDIN_COMMUNITY_APPROVED!=="true"))blockers.push("linkedin_approved_app_configuration_required");
  return blockers;
}
async function jsonRequest(url:string,init:RequestInit):Promise<{data:ObjectData;headers:Headers}> {
  let response:Response;
  try{response=await fetch(url,{...init,redirect:"manual",signal:AbortSignal.timeout(20000)});}catch{throw new PublishingProviderError(false,"provider_transport_uncertain");}
  if(response.status>=300&&response.status<400)throw new PublishingProviderError(false,"provider_redirect_rejected",response.status);
  const data=await response.json().catch(()=>null) as ObjectData|null;
  if(!response.ok||data?.error){const rejected=response.status>=400&&response.status<500||response.ok&&!!data?.error;throw new PublishingProviderError(rejected,rejected?`provider_rejected_http_${response.status}`:"provider_result_uncertain",response.status);}
  if(!data&&response.status===201&&response.headers.has("x-restli-id"))return {data:{},headers:response.headers};
  if(!data||typeof data!=="object"||Array.isArray(data))throw new PublishingProviderError(false,"provider_response_invalid",response.status);
  return {data,headers:response.headers};
}
export async function linkedinAuth(env:Env,path:"introspectToken"|"accessToken",params:Record<string,string>) {
  if(!env.LINKEDIN_CLIENT_ID||!env.LINKEDIN_CLIENT_SECRET||env.LINKEDIN_COMMUNITY_APPROVED!=="true")throw new HttpError(409,"LinkedIn requires an approved configured Community Management app and an owner-authorised connection.");
  return (await jsonRequest(`https://www.linkedin.com/oauth/v2/${path}`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({...params,client_id:env.LINKEDIN_CLIENT_ID,client_secret:env.LINKEDIN_CLIENT_SECRET})})).data;
}
export async function linkedinTokenInfo(env:Env,token:string) {
  const data=await linkedinAuth(env,"introspectToken",{token});
  if(data.active!==true||data.client_id!==env.LINKEDIN_CLIENT_ID||data.auth_type!=="3L"||typeof data.expires_at!=="number"||data.expires_at*1000<=Date.now())throw new HttpError(409,"The LinkedIn member grant is invalid, expired or belongs to another app.");
  const permissions=typeof data.scope==="string"?data.scope.split(/[,\s]+/).filter(Boolean):[];
  if(LINKEDIN_SCOPES.some(s=>!permissions.includes(s)))throw new HttpError(409,"The LinkedIn grant lacks approved organization publishing, readback or role-check permission.");
  return {permissions,expiresAt:data.expires_at*1000};
}
export async function linkedinApi(env:Env,token:string,path:string,body?:ObjectData) {
  if(!/^\/(organizations\/\d+|organizationAcls\?|images(?:\?|\/)|posts(?:\?|\/|$))/.test(path))throw new HttpError(400,"Unsupported LinkedIn publishing endpoint.");
  const version=env.LINKEDIN_API_VERSION||"202608";if(!/^20\d{4}$/.test(version))throw new HttpError(503,"Configure a supported LinkedIn API version.");
  return jsonRequest(`https://api.linkedin.com/rest${path}`,{method:body?"POST":"GET",headers:{authorization:`Bearer ${token}`,"Linkedin-Version":version,"X-Restli-Protocol-Version":"2.0.0","content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
}
export async function linkedinOrganizations(env:Env,token:string) {
  const rows:ObjectData[]=[];
  for(let start=0;start<400;start+=100){const {data}=await linkedinApi(env,token,`/organizationAcls?q=roleAssignee&state=APPROVED&count=100&start=${start}`);if(!Array.isArray(data.elements))throw new HttpError(502,"LinkedIn organization roles were not returned.");const page=data.elements as ObjectData[];rows.push(...page);const paging=data.paging as {links?:Array<{rel?:string}>}|undefined;if(page.length<100&&!paging?.links?.some(l=>l.rel==="next"))return rows.filter(row=>row.state==="APPROVED"&&["ADMINISTRATOR","CONTENT_ADMINISTRATOR","CONTENT_ADMIN"].includes(String(row.role)));}
  throw new HttpError(409,"LinkedIn organization discovery is incomplete. Narrow the owner's account setup before connecting.");
}
export async function publishingGrant(env:Env,account:SocialAccount,channel:PublishChannel):Promise<PublishGrant>{
  const blockers=localPublishBlockers(env,account,channel);if(blockers.length)throw new HttpError(409,blockers.join(", "));
  if(!/^\d{1,32}$/.test(account.asset_id))throw new HttpError(409,"Publishing requires an exact provider asset ID.");
  if(account.provider==="linkedin"){
    const token=await decrypt(account.token!,env.TOKEN_ENCRYPTION_KEY);await linkedinTokenInfo(env,token);const roles=await linkedinOrganizations(env,token);const organization=`urn:li:organization:${account.asset_id}`;
    if(!roles.some(row=>(row.organization||row.organizationTarget)===organization&&row.roleAssignee===account.provider_user_id))throw new HttpError(403,"The connected LinkedIn member no longer has the required role for this exact organization.");
    const {data}=await linkedinApi(env,token,`/organizations/${account.asset_id}`);if(String(data.id)!==account.asset_id)throw new HttpError(403,"LinkedIn organization identity did not match.");return {token,account,channel,business:true,person:account.provider_user_id!};
  }
  if(!account.user_token||!account.provider_user_id||!env.META_APP_ID||!env.META_APP_SECRET)throw new HttpError(409,"A current app-bound Meta user grant is required for publishing.");
  const userToken=await decrypt(account.user_token,env.TOKEN_ENCRYPTION_KEY);const grant=await discover(env,userToken);if(grant.providerUserId!==account.provider_user_id)throw new HttpError(403,"The Meta granting identity no longer matches this account.");
  if(requiredPublishScopes(channel).some(scope=>!grant.permissions.includes(scope)))throw new HttpError(409,"The live Meta grant lacks the required publishing permission.");
  const asset=grant.candidates.find(a=>a.provider===account.provider&&a.assetId===account.asset_id&&a.parentId===(account.parent_id||account.asset_id));if(!asset)throw new HttpError(403,"The publishing destination is not in this exact grant.");
  if(!asset.tasks.some(task=>["CREATE_CONTENT","MANAGE"].includes(task)))throw new HttpError(409,"The current Page grant does not verify content-creation tasks.");
  const token=account.provider==="instagram"?userToken:await decrypt(account.token!,env.TOKEN_ENCRYPTION_KEY);const tokenInfo=await inspectToken(env,token);if(tokenInfo.providerUserId!==account.provider_user_id)throw new HttpError(403,"The saved publishing credential belongs to a different granting identity.");
  const info=await graph(token,account.asset_id,{fields:account.provider==="instagram"?"id,username,account_type":"id,name"});if(info.id!==account.asset_id)throw new HttpError(403,"The provider destination identity did not match.");
  const business=account.provider==="facebook"||info.account_type==="BUSINESS";
  if(channel==="instagram_story"&&!business)throw new HttpError(409,"Instagram Story publishing requires a verified Business account, separately from feed publishing.");
  return {token,account,channel,business};
}
export function validatePublishingImage(media:Media,channel:PublishChannel) {
  if(media.state!=="ready"||!media.width||!media.height||media.bytes>4*1024*1024)throw new HttpError(409,"Use a completed image upload up to 4 MiB.");
  if(channel.startsWith("instagram")&&media.mime!=="image/jpeg")throw new HttpError(409,"Instagram requires a JPEG. Convert the approved artwork without crop or dimension changes before upload.");
  if(isStory(channel)&&(media.width*16!==media.height*9||media.width<540||media.height<960))throw new HttpError(409,"Use the separately approved 9:16 Story artwork at least 540 by 960 pixels; no automatic crop is applied.");
  if(channel==="instagram_feed"&&(media.width/media.height<0.8||media.width/media.height>1.91||media.width<320||media.width>1440))throw new HttpError(409,"The approved feed image must fit Instagram's supported size and aspect ratio without cropping.");
}
async function metaWrite(token:string,path:string,params:Record<string,string>){return (await jsonRequest(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params)})).data;}
function providerId(value:unknown) {if(typeof value!=="string"||!/^\d{1,32}(?:_\d{1,32})?$/.test(value))throw new PublishingProviderError(false,"provider_receipt_id_missing");return value;}
export interface DispatchHooks {beforeWrite:(stage:"upload"|"publish")=>Promise<void>;checkpoint:(preparedId:string)=>Promise<void>;receiptId:(providerId:string)=>Promise<void>}
export async function dispatchPublishing(env:Env,grant:PublishGrant,target:PublishTarget,media:Media,hooks:DispatchHooks,preparedId:string|null=null):Promise<ProviderReceipt>{
  validatePublishingImage(media,target.channel);const asset=grant.account.asset_id;let receiptId:string;
  if(grant.account.provider==="instagram"){
    if(!preparedId){await hooks.beforeWrite("upload");const params:Record<string,string>={image_url:await providerMediaUrl(env,media)};if(isStory(target.channel))params.media_type="STORIES";else{params.caption=target.caption;params.alt_text=target.altText;}preparedId=providerId((await metaWrite(grant.token,`${asset}/media`,params)).id);await hooks.checkpoint(preparedId);}
    const container=await graph(grant.token,preparedId,{fields:"id,status_code"});if(container.id!==preparedId)throw new PublishingProviderError(false,"instagram_container_identity_mismatch");
    if(container.status_code!=="FINISHED")throw new PublishingProviderError(container.status_code==="ERROR"||container.status_code==="EXPIRED","instagram_container_not_ready");
    await hooks.beforeWrite("publish");receiptId=providerId((await metaWrite(grant.token,`${asset}/media_publish`,{creation_id:preparedId})).id);
  }else if(grant.account.provider==="facebook"){
    if(isStory(target.channel)){
      if(!preparedId){await hooks.beforeWrite("upload");preparedId=providerId((await metaWrite(grant.token,`${asset}/photos`,{url:await providerMediaUrl(env,media),published:"false"})).id);await hooks.checkpoint(preparedId);}
      await hooks.beforeWrite("publish");const result=await metaWrite(grant.token,`${asset}/photo_stories`,{photo_id:preparedId});receiptId=providerId(result.post_id||result.id);
    }else{await hooks.beforeWrite("publish");const result=await metaWrite(grant.token,`${asset}/photos`,{url:await providerMediaUrl(env,media),published:"true",caption:target.caption,alt_text_custom:target.altText});receiptId=providerId(result.post_id);}
  }else{
    if(!preparedId){await hooks.beforeWrite("upload");const {data}=await linkedinApi(env,grant.token,"/images?action=initializeUpload",{initializeUploadRequest:{owner:`urn:li:organization:${asset}`}});const value=data.value as {uploadUrl?:string;image?:string;uploadUrlExpiresAt?:number}|undefined;
      if(!value?.uploadUrl||!value.image||!/^urn:li:image:[a-zA-Z0-9_-]+$/.test(value.image)||Number(value.uploadUrlExpiresAt)<=Date.now())throw new PublishingProviderError(false,"linkedin_upload_session_invalid");
      const url=new URL(value.uploadUrl);if(url.protocol!=="https:"||url.username||url.password||url.hostname!=="www.linkedin.com"||!url.pathname.startsWith("/dms-uploads/"))throw new PublishingProviderError(false,"linkedin_upload_origin_rejected");
      await hooks.beforeWrite("upload");let response:Response;try{response=await fetch(url,{method:"PUT",headers:{authorization:`Bearer ${grant.token}`,"content-type":media.mime},body:await mediaBytes(env,media),redirect:"manual",signal:AbortSignal.timeout(20000)});}catch{throw new PublishingProviderError(false,"linkedin_upload_uncertain");}if(!response.ok)throw new PublishingProviderError(response.status>=400&&response.status<500,"linkedin_upload_rejected",response.status);preparedId=value.image;await hooks.checkpoint(preparedId);
    }
    const image=(await linkedinApi(env,grant.token,`/images/${encodeURIComponent(preparedId)}`)).data;if(image.id!==preparedId||image.owner!==`urn:li:organization:${asset}`||image.status!=="AVAILABLE")throw new PublishingProviderError(false,"linkedin_image_not_ready_or_wrong_owner");
    await hooks.beforeWrite("publish");const result=await linkedinApi(env,grant.token,"/posts",{author:`urn:li:organization:${asset}`,commentary:target.caption,visibility:"PUBLIC",distribution:{feedDistribution:"MAIN_FEED",targetEntities:[],thirdPartyDistributionChannels:[]},content:{media:{id:preparedId,altText:target.altText}},lifecycleState:"PUBLISHED",isReshareDisabledByAuthor:false});receiptId=result.headers.get("x-restli-id")||"";if(!/^urn:li:(share|ugcPost):\d+$/.test(receiptId))throw new PublishingProviderError(false,"linkedin_receipt_id_missing");
  }
  await hooks.receiptId(receiptId);return reconcilePublishing(env,grant,target,media,receiptId);
}
export async function reconcilePublishing(env:Env,grant:PublishGrant,target:PublishTarget,media:Media|null,receiptId:string):Promise<ProviderReceipt>{
  const account=grant.account;let url:string|null=null,publishedAt:string|null=null,expiryState:ProviderReceipt["expiryState"]=isStory(target.channel)?"unknown":"not_applicable",altText:ProviderReceipt["altText"]="submitted";
  if(account.provider==="linkedin"){
    if(!/^urn:li:(share|ugcPost):\d+$/.test(receiptId))throw new HttpError(400,"Invalid LinkedIn receipt ID.");const data=(await linkedinApi(env,grant.token,`/posts/${encodeURIComponent(receiptId)}?viewContext=AUTHOR`)).data;
    if(data.id!==receiptId||data.author!==`urn:li:organization:${account.asset_id}`||data.lifecycleState!=="PUBLISHED"||data.commentary!==target.caption)throw new HttpError(409,"LinkedIn has not confirmed this exact organization's approved post.");
    // LinkedIn's API returns an ID, not necessarily a canonical URL. Never invent one.
    url=safeUrl(data.permalink,target.channel);if(typeof data.publishedAt==="number"&&Number.isFinite(data.publishedAt))publishedAt=new Date(data.publishedAt).toISOString();const content=data.content as {media?:{altText?:string}}|undefined;if(content?.media?.altText===target.altText)altText="verified";
  }else if(account.provider==="instagram"){
    providerId(receiptId);const data=await graph(grant.token,receiptId,{fields:`id,owner,caption,media_type,media_product_type,permalink,timestamp${isStory(target.channel)?"":",alt_text"}`});const owner=data.owner as {id?:string}|string|undefined;
    if(data.id!==receiptId||(typeof owner==="string"?owner:owner?.id)!==account.asset_id||data.media_type!=="IMAGE"||(isStory(target.channel)?data.media_product_type!=="STORY":data.caption!==target.caption||data.media_product_type==="STORY"))throw new HttpError(409,"Instagram has not verified the exact destination and approved media type/content.");
    url=safeUrl(data.permalink,target.channel);publishedAt=providerTime(data.timestamp);if(isStory(target.channel)){altText="not_supported";expiryState="active";}else if(data.alt_text===target.altText)altText="verified";
  }else if(isStory(target.channel)){
    providerId(receiptId);const result=await graph(grant.token,`${account.asset_id}/stories`,{fields:"id,post_id,media_id,media_type,status,url,creation_time",status:JSON.stringify(["PUBLISHED","ARCHIVED"]),limit:"100"});if(!Array.isArray(result.data))throw new HttpError(409,"Facebook Story readback is unavailable.");const story=(result.data as ObjectData[]).find(row=>row.post_id===receiptId||row.id===receiptId);
    if(!story||!["PUBLISHED","ARCHIVED"].includes(String(story.status)))throw new HttpError(409,"Facebook has not confirmed this Story on the exact Page. Archive or incomplete results never prove absence.");url=safeUrl(story.url,target.channel);publishedAt=providerTime(story.creation_time);altText="not_supported";expiryState=story.status==="ARCHIVED"?"expired":"active";
  }else{
    providerId(receiptId);const data=await graph(grant.token,receiptId,{fields:"id,from,message,is_published,permalink_url,created_time"});const from=data.from as {id?:string}|undefined;if(data.id!==receiptId||from?.id!==account.asset_id||data.is_published!==true||data.message!==target.caption)throw new HttpError(409,"Facebook has not confirmed this exact Page's approved feed post.");url=safeUrl(data.permalink_url,target.channel);publishedAt=providerTime(data.created_time);
  }
  return {providerId:receiptId,url,publishedAt,verifiedAt:new Date().toISOString(),expiresAt:null,expiryState,verification:"provider_readback",method:isStory(target.channel)?"separate_story_image_upload":"organic_single_image",mediaSha256:media?.sha256||null,altText};
}
function providerTime(value:unknown) {if(typeof value!=="string"&&typeof value!=="number")return null;const time=typeof value==="number"?value*1000:Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;}


// A bounded negative scan is usable only when every requested collection is exhausted.
// Existing scheduled/native content is never deleted or overwritten by this module.
export async function scanPublishingDate(env:Env,grant:PublishGrant,topicDate:string) {
  const matches:Array<{id:string;collection:string}>=[];
  if(grant.account.provider==="linkedin"){
    const author=encodeURIComponent(`urn:li:organization:${grant.account.asset_id}`);
    for(let start=0;start<400;start+=100){const {data}=await linkedinApi(env,grant.token,`/posts?q=author&author=${author}&count=100&start=${start}&sortBy=CREATED&viewContext=AUTHOR`);if(!Array.isArray(data.elements))throw new HttpError(409,"LinkedIn duplicate-check collection is unavailable.");for(const row of data.elements as ObjectData[]){const at=typeof row.publishedAt==="number"?row.publishedAt:row.createdAt;if(typeof at!=="number")throw new HttpError(409,"LinkedIn did not expose timestamps for duplicate checking.");if(sydneyTime(at).date===topicDate)matches.push({id:String(row.id),collection:"posts"});}if(data.elements.length<100)return {complete:false,matches,requiresNativePlannerInspection:true};}throw new HttpError(409,"LinkedIn duplicate-check coverage is incomplete; inspect native state.");
  }
  const asset=grant.account.asset_id;
  const collections=grant.channel==="facebook_feed"?["published_posts","scheduled_posts"]:grant.channel==="instagram_feed"?["media","scheduled_media"]:["stories"];
  for(const collection of collections){let path:string|null=`${asset}/${collection}`;
    for(let page=0;page<4&&path;page++){
      const fields=collection==="stories"&&grant.account.provider==="facebook"?"id,post_id,status,creation_time":grant.account.provider==="facebook"?"id,created_time,scheduled_publish_time":"id,timestamp";
      const result=await graph(grant.token,path,page===0?{fields,limit:"100"}:{});if(!Array.isArray(result.data))throw new HttpError(409,"Native duplicate-check collection was not returned.");
      for(const row of result.data as ObjectData[]){const value=row.scheduled_publish_time||row.timestamp||row.created_time||row.creation_time;const parsed=typeof value==="number"?value*1000:typeof value==="string"?Date.parse(value):NaN;if(!Number.isFinite(parsed))throw new HttpError(409,"Native timestamps are unavailable. Inspect published and scheduled content before recording clearance.");if(sydneyTime(parsed).date===topicDate)matches.push({id:String(row.post_id||row.id),collection});}
      const next=(result.paging as {next?:unknown}|undefined)?.next;path=typeof next==="string"?next:null;
      if(page===3&&path)throw new HttpError(409,"Native duplicate-check coverage is incomplete; inspect published and scheduled state.");
    }
  }
  return {complete:true,matches};
}
