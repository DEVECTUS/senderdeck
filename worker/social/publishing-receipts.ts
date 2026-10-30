import { HttpError } from "../auth";
import type { Env } from "../env";
import { encrypt, sha256Base64Url } from "../crypto";
import { accountFor, admins, audit, brandFor, id, str } from "./model";
import { date, destination, fields, isStory, safeUrl, sydneyTime, verifyDestination, type Delivery, type ProviderReceipt, type PublishItem, type PublishManifest } from "./publishing-model";

// An authenticated native observation is recorded as such, never relabelled API proof.
// Published history survives Story expiry and contradictory legacy expiry labels.
export async function importPublishingReceipt(env:Env,user:string,brandId:string,a:Record<string,unknown>){
  fields(a,["brandId","contentKey","topicDate","title","channel","accountId","assetId","providerId","url","publishedAt","expiresAt","expiryState","mediaSha256","evidence","confirmed"]);
  const brand=await brandFor(env,user,brandId,admins);const target=destination(a);
  if(!/^\d{1,32}$/.test(target.assetId))throw new HttpError(400,"Use the exact native provider asset ID.");
  if(target.accountId){const {account}=await accountFor(env,user,brandId,target.accountId,admins);verifyDestination(account,target);}
  const topicDate=date(a.topicDate);if(topicDate>sydneyTime().date)throw new HttpError(400,"A future scheduled item is not an actual published receipt.");
  if(a.confirmed!==true)throw new HttpError(400,"Confirm the exact native publication evidence; recording it does not publish.");
  const url=safeUrl(a.url,target.channel),providerId=typeof a.providerId==="string"&&a.providerId.trim()?str(a.providerId,"providerId",150):null;
  if(a.url&&!url)throw new HttpError(400,"The receipt URL must be an actual credential-free provider URL.");
  if(!url&&!providerId)throw new HttpError(400,"Provide the actual provider URL or ID, not a constructed link.");
  const published=Date.parse(str(a.publishedAt,"publishedAt",50));if(!Number.isFinite(published)||published>Date.now()||sydneyTime(published).date!==topicDate)throw new HttpError(400,"Published time must be actual, no later than now, and on this topic's Sydney date.");
  let expiresAt:string|null=null;if(a.expiresAt!==null&&a.expiresAt!==undefined){const expiry=Date.parse(str(a.expiresAt,"expiresAt",50));if(!Number.isFinite(expiry)||expiry<=published)throw new HttpError(400,"Invalid observed Story expiry.");expiresAt=new Date(expiry).toISOString();}
  const contentKey=str(a.contentKey,"contentKey",120),title=str(a.title,"title",200),evidence=str(a.evidence,"evidence",2000);
  let row=await env.DB.prepare("SELECT * FROM social_publish_items WHERE brand_id=? AND (content_key=? OR topic_date=?)").bind(brandId,contentKey,topicDate).first<PublishItem>();
  if(row&&(row.content_key!==contentKey||row.topic_date!==topicDate))throw new HttpError(409,"This Sydney date already belongs to another recorded topic.");
  if(!row){
    const manifest:PublishManifest={contentKey,topicDate,title,targets:[],imported:true};const itemId=id(),at=Date.now(),days=Math.max(1,Math.min(365,Number(JSON.parse(brand.profile).retentionDays)||30));
    await env.DB.prepare("INSERT INTO social_publish_items (id,brand_id,content_key,topic_date,revision,digest,encrypted,disposition,policy_revision,user_id,created_at,updated_at,expires_at) VALUES (?,?,?,?,1,?,?,'external_history',0,?,?,?,?)").bind(itemId,brandId,contentKey,topicDate,await sha256Base64Url(JSON.stringify(manifest)),await encrypt(JSON.stringify(manifest),env.TOKEN_ENCRYPTION_KEY),user,at,at,at+days*86400000).run();
    row=(await env.DB.prepare("SELECT * FROM social_publish_items WHERE id=? AND brand_id=?").bind(itemId,brandId).first<PublishItem>())!;
  }
  const existing=await env.DB.prepare("SELECT * FROM social_publish_deliveries WHERE item_id=? AND channel=?").bind(row.id,target.channel).first<Delivery>();
  if(existing&&existing.account_id!==target.accountId)throw new HttpError(409,"The historical destination account does not match this item's ledger.");
  if(existing?.state==="publishing"&&existing.started_at&&Date.now()-existing.started_at<300000)throw new HttpError(409,"An active attempt must finish before importing its receipt.");
  if(existing&&["published","external_published"].includes(existing.state))return {itemId:row.id,channel:target.channel,state:existing.state,receipt:existing.receipt?JSON.parse(existing.receipt):null,preserved:true};
  const mediaSha256=a.mediaSha256===undefined||a.mediaSha256===null?null:str(a.mediaSha256,"mediaSha256",64);if(mediaSha256&&!/^[a-f0-9]{64}$/.test(mediaSha256))throw new HttpError(400,"Invalid recorded image hash.");
  const receipt:ProviderReceipt={providerId,url,publishedAt:new Date(published).toISOString(),verifiedAt:new Date().toISOString(),expiresAt,expiryState:isStory(target.channel)?["active","expired"].includes(String(a.expiryState))?a.expiryState as "active"|"expired":"unknown":"not_applicable",verification:"native_operator_record",method:"external_native_receipt",mediaSha256,altText:"unknown",evidence,assetId:target.assetId,channel:target.channel};
  const warnings=a.expiryState==="not_published"?["Contradictory legacy expiry state was ignored; the actual published receipt is retained."]:[];
  await env.DB.prepare("INSERT INTO social_publish_deliveries (id,item_id,account_id,channel,revision,state,stage,provider_id,receipt_key,receipt,updated_at) VALUES (?,?,?,?,?,'external_published','native_receipt',?,?,?,?) ON CONFLICT(item_id,channel) DO UPDATE SET state='external_published',stage='native_receipt',provider_id=excluded.provider_id,receipt_key=excluded.receipt_key,receipt=excluded.receipt,error=NULL,updated_at=excluded.updated_at").bind(existing?.id||id(),row.id,target.accountId,target.channel,row.revision,providerId,await sha256Base64Url(providerId||url!),JSON.stringify(receipt),Date.now()).run();
  await audit(env,brandId,user,"native_publication_receipt_recorded",row.id,target.channel);return {itemId:row.id,channel:target.channel,state:"external_published",receipt,warnings,publishedByThisCall:false};
}
