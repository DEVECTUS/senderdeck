import { HttpError, requireUserId } from "../auth";
import type { Env } from "../env";
import { decrypt, encrypt, randomBase64Url, sha256Base64Url } from "../crypto";
import { admins, brandFor, id, str } from "./model";
import { fields } from "./publishing-model";
import { LINKEDIN_SCOPES, linkedinAuth, linkedinApi, linkedinOrganizations, linkedinTokenInfo } from "./publishing-providers";
import { publicOrigin, socialRedirect } from "./oauth";

interface LinkedInGrant {kind:"linkedin_publishing";token:string;permissions:string[];expiresAt:number}
function configured(env:Env){if(!env.LINKEDIN_CLIENT_ID||!env.LINKEDIN_CLIENT_SECRET||env.LINKEDIN_COMMUNITY_APPROVED!=="true")throw new HttpError(409,"The owner must configure an approved LinkedIn Community Management app before connecting an organization. A native browser login is not an API grant.");}
async function grantFor(env:Env,user:string,brandId:string,grantId:string){
  await brandFor(env,user,brandId,admins);const row=await env.DB.prepare("SELECT encrypted FROM social_grants WHERE id=? AND brand_id=? AND user_id=? AND expires_at>?").bind(grantId,brandId,user,Date.now()).first<{encrypted:string}>();if(!row)throw new HttpError(404,"LinkedIn organization selection expired or was not found.");
  const grant=JSON.parse(await decrypt(row.encrypted,env.TOKEN_ENCRYPTION_KEY)) as LinkedInGrant;if(grant.kind!=="linkedin_publishing"||!grant.token)throw new HttpError(403,"This grant belongs to another connection flow.");return grant;
}
export async function linkedInPublishingAction(name:string,a:Record<string,unknown>,env:Env,user:string){
  const brandId=str(a.brandId,"brandId",100);await brandFor(env,user,brandId,admins);configured(env);
  if(name==="social_publish_linkedin_start"){
    fields(a,["brandId","confirmed"]);if(a.confirmed!==true)throw new HttpError(400,"Start a new LinkedIn permission grant only under explicit owner authorization, separate from routine content approval.");
    const state=randomBase64Url(),redirect=`${publicOrigin(env)}/oauth/social/linkedin/callback`;
    await env.DB.prepare("INSERT INTO social_oauth (hash,brand_id,user_id,redirect_uri,expires_at) VALUES (?,?,?,?,?)").bind(await sha256Base64Url(state),brandId,user,redirect,Date.now()+600000).run();
    const url=new URL("https://www.linkedin.com/oauth/v2/authorization");for(const [key,value] of Object.entries({response_type:"code",client_id:env.LINKEDIN_CLIENT_ID!,redirect_uri:redirect,state,scope:LINKEDIN_SCOPES.join(" ")}))url.searchParams.set(key,value);
    return {authorizationUrl:url.href,brandId,scope:LINKEDIN_SCOPES,instruction:"The owner completes LinkedIn consent and selects the exact authorized company. No posting or inbox access is implied."};
  }
  fields(a,name==="social_publish_linkedin_select"?["brandId","grantId","assetId","confirmed"]:["brandId","grantId"]);
  const grant=await grantFor(env,user,brandId,str(a.grantId,"grantId",100));const info=await linkedinTokenInfo(env,grant.token);const roles=await linkedinOrganizations(env,grant.token);
  const candidates=roles.filter(role=>/^urn:li:organization:\d+$/.test(String(role.organization||role.organizationTarget))&&/^urn:li:person:[A-Za-z0-9_-]+$/.test(String(role.roleAssignee)));
  if(name==="social_publish_linkedin_organizations")return {organizations:candidates.map(role=>({assetId:String(role.organization||role.organizationTarget).split(":").pop(),role:role.role})),note:"Select the exact company ID. No token or member identity is returned."};
  if(name!=="social_publish_linkedin_select")throw new HttpError(404,"Unknown LinkedIn publishing setup action.");
  if(a.confirmed!==true)throw new HttpError(400,"Confirm connecting only this exact organization.");const assetId=str(a.assetId,"assetId",32);if(!/^\d{1,32}$/.test(assetId))throw new HttpError(400,"Invalid organization ID.");
  const role=candidates.find(row=>(row.organization||row.organizationTarget)===`urn:li:organization:${assetId}`);if(!role)throw new HttpError(403,"This organization is not authorized for the connected LinkedIn member.");
  const existing=await env.DB.prepare("SELECT id,brand_id FROM social_accounts WHERE provider='linkedin' AND asset_id=?").bind(assetId).first<{id:string;brand_id:string}>();if(existing&&existing.brand_id!==brandId)throw new HttpError(409,"This organization belongs to another SenderDeck brand; its connection is preserved.");
  const {data}=await linkedinApi(env,grant.token,`/organizations/${assetId}`);if(String(data.id)!==assetId)throw new HttpError(403,"The selected organization identity did not match.");const accountId=existing?.id||id(),nameLabel=typeof data.localizedName==="string"?data.localizedName:`LinkedIn organization ${assetId}`;
  await env.DB.prepare("INSERT INTO social_accounts (id,brand_id,provider,asset_id,parent_id,provider_user_id,name,token,user_token,expires_at,permissions,status,validation,validated_at,monitoring,last_reconciled_at,created_at) VALUES (?,?,'linkedin',?,NULL,?,?,?,NULL,?,?,'connected',?,NULL,?,NULL,?) ON CONFLICT(provider,asset_id) DO UPDATE SET provider_user_id=excluded.provider_user_id,name=excluded.name,token=excluded.token,expires_at=excluded.expires_at,permissions=excluded.permissions,status=excluded.status,validation=excluded.validation,validated_at=NULL WHERE social_accounts.brand_id=excluded.brand_id").bind(accountId,brandId,assetId,role.roleAssignee,nameLabel,await encrypt(grant.token,env.TOKEN_ENCRYPTION_KEY),info.expiresAt,JSON.stringify(info.permissions),JSON.stringify({publishingOnly:true,organizationRole:role.role}),JSON.stringify({enabled:false,intervalMinutes:10}),Date.now()).run();
  const saved=await env.DB.prepare("SELECT id,brand_id FROM social_accounts WHERE provider='linkedin' AND asset_id=?").bind(assetId).first<{id:string;brand_id:string}>();if(!saved||saved.id!==accountId||saved.brand_id!==brandId)throw new HttpError(409,"Organization assignment changed during connection.");
  return {accountId,brandId,assetId,name:nameLabel,provider:"linkedin",publishingOnly:true,inboxAvailable:false};
}
export async function linkedInPublishingCallback(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);if(url.pathname!=="/oauth/social/linkedin/callback")return null;if(request.method!=="GET")throw new HttpError(405,"Method not allowed.");configured(env);const user=await requireUserId(request,env);const state=str(url.searchParams.get("state"),"state",1000);
  const row=await env.DB.prepare("DELETE FROM social_oauth WHERE hash=? AND user_id=? AND expires_at>? RETURNING brand_id,redirect_uri").bind(await sha256Base64Url(state),user,Date.now()).first<{brand_id:string;redirect_uri:string}>();
  if(!row||row.redirect_uri!==`${publicOrigin(env)}${url.pathname}`)return socialRedirect(env,"/publishing?connection=restart_required");await brandFor(env,user,row.brand_id,admins);
  const code=url.searchParams.get("code");if(!code||url.searchParams.has("error"))return socialRedirect(env,`/publishing?brand=${encodeURIComponent(row.brand_id)}&connection=cancelled`);
  const exchange=await linkedinAuth(env,"accessToken",{grant_type:"authorization_code",code,redirect_uri:row.redirect_uri});if(typeof exchange.access_token!=="string")throw new HttpError(502,"LinkedIn did not return a member authorization token.");const info=await linkedinTokenInfo(env,exchange.access_token);const grantId=id();
  await env.DB.prepare("INSERT INTO social_grants (id,brand_id,user_id,encrypted,expires_at) VALUES (?,?,?,?,?)").bind(grantId,row.brand_id,user,await encrypt(JSON.stringify({kind:"linkedin_publishing",token:exchange.access_token,...info}),env.TOKEN_ENCRYPTION_KEY),Date.now()+600000).run();
  return socialRedirect(env,`/publishing?brand=${encodeURIComponent(row.brand_id)}&linkedinGrant=${encodeURIComponent(grantId)}`);
}
