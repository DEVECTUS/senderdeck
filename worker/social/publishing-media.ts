import { HttpError } from "../auth";
import { decrypt, encrypt } from "../crypto";
import type { Env } from "../env";
import { publicOrigin } from "./oauth";
import { admins, brandFor, editors, id, str } from "./model";
import { fields, type Media } from "./publishing-model";

export const MEDIA_CHUNK_BYTES=32768, MAX_MEDIA_BYTES=4*1024*1024;
const utf8=new TextEncoder();
export async function hexHash(bytes:Uint8Array) { const hash=await crypto.subtle.digest("SHA-256",new Uint8Array(bytes));return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join(""); }
function decode(value:unknown) { if(typeof value!=="string"||value.length>44000||!value.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new HttpError(400,"Invalid bounded base64 media chunk.");try{return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{throw new HttpError(400,"Invalid media encoding.");} }
export function imageSize(bytes:Uint8Array,mime:string) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(mime==="image/png"&&bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)&&String.fromCharCode(...bytes.slice(12,16))==="IHDR")return {width:view.getUint32(16),height:view.getUint32(20)};
  if(mime==="image/jpeg"&&bytes[0]===255&&bytes[1]===216){let p=2;while(p+4<bytes.length){if(bytes[p]!==255)break;const mark=bytes[p+1];p+=2;if(mark===217||mark===218)break;if(mark===216||mark===1||mark>=208&&mark<=215)continue;const length=view.getUint16(p);if(length<2||p+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(mark)&&length>=7)return {height:view.getUint16(p+3),width:view.getUint16(p+5)};p+=length;}}
  throw new HttpError(400,"The file is not a supported JPEG or PNG image.");
}
export async function mediaFor(env:Env,brandId:string,mediaId:string) {const row=await env.DB.prepare("SELECT * FROM social_publish_media WHERE id=? AND brand_id=? AND expires_at>?").bind(mediaId,brandId,Date.now()).first<Media>();if(!row)throw new HttpError(404,"Publishing media is missing or expired in this brand.");return row;}
export async function mediaBytes(env:Env,media:Media) {const chunks=(await env.DB.prepare("SELECT ordinal,encrypted FROM social_publish_media_chunks WHERE media_id=? ORDER BY ordinal").bind(media.id).all<{ordinal:number;encrypted:string}>()).results;const expected=Math.ceil(media.bytes/MEDIA_CHUNK_BYTES);if(chunks.length!==expected||chunks.some((c,i)=>c.ordinal!==i))throw new HttpError(409,"The media upload is incomplete.");const out=new Uint8Array(media.bytes);let offset=0;for(const c of chunks){const bytes=decode(await decrypt(c.encrypted,env.TOKEN_ENCRYPTION_KEY));if(bytes.length!==Math.min(MEDIA_CHUNK_BYTES,media.bytes-offset))throw new HttpError(409,"Media chunk size does not match the upload.");out.set(bytes,offset);offset+=bytes.length;}return out;}
export async function mediaAction(name:string,a:Record<string,unknown>,env:Env,user:string) {
  const brandId=str(a.brandId,"brandId",100);const brand=await brandFor(env,user,brandId,editors);
  if(name==="social_publish_media_prepare"){
    fields(a,["brandId","mime","bytes","sha256","sourceSha256"]);
    const mime=str(a.mime,"mime",30),hash=str(a.sha256,"sha256",64),bytes=a.bytes;
    if(!["image/jpeg","image/png"].includes(mime)||!/^[a-f0-9]{64}$/.test(hash)||!Number.isInteger(bytes)||Number(bytes)<24||Number(bytes)>MAX_MEDIA_BYTES)throw new HttpError(400,"Use a JPEG or PNG up to 4 MiB with its SHA256 hash.");
    const source=a.sourceSha256===undefined?null:str(a.sourceSha256,"sourceSha256",64);if(source&&!/^[a-f0-9]{64}$/.test(source))throw new HttpError(400,"Invalid source image hash.");
    const quota=await env.DB.prepare("SELECT SUM(bytes) AS total FROM social_publish_media WHERE brand_id=? AND expires_at>?").bind(brandId,Date.now()).first<{total:number|null}>();if(Number(quota?.total||0)+Number(bytes)>64*1024*1024)throw new HttpError(409,"This brand's active media upload limit is reached.");
    const days=Number(JSON.parse(brand.profile).retentionDays)||30,expiresAt=Date.now()+Math.min(2,Math.max(1,days))*86400000,mediaId=id();
    await env.DB.prepare("INSERT INTO social_publish_media (id,brand_id,user_id,mime,bytes,sha256,source_sha256,state,created_at,expires_at) VALUES (?,?,?,?,?,?,?,'uploading',?,?)").bind(mediaId,brandId,user,mime,bytes,hash,source,Date.now(),expiresAt).run();
    return {mediaId,chunkBytes:MEDIA_CHUNK_BYTES,chunks:Math.ceil(Number(bytes)/MEDIA_CHUNK_BYTES),expiresAt};
  }
  const row=await mediaFor(env,brandId,str(a.mediaId,"mediaId",100));
  if(name==="social_publish_media_status"){fields(a,["brandId","mediaId"]);return {mediaId:row.id,mime:row.mime,bytes:row.bytes,sha256:row.sha256,sourceSha256:row.source_sha256,width:row.width,height:row.height,state:row.state,expiresAt:row.expires_at};}
  if(row.user_id!==user&&!admins.includes(brand.role!))throw new HttpError(403,"Only the uploader or a brand administrator may finish this upload.");
  if(name==="social_publish_media_chunk"){
    fields(a,["brandId","mediaId","ordinal","base64"]);if(row.state!=="uploading")throw new HttpError(409,"Completed media is immutable.");const ordinal=Number(a.ordinal);if(!Number.isInteger(a.ordinal)||ordinal<0||ordinal>=Math.ceil(row.bytes/MEDIA_CHUNK_BYTES))throw new HttpError(400,"Invalid media chunk index.");const bytes=decode(a.base64);if(bytes.length!==Math.min(MEDIA_CHUNK_BYTES,row.bytes-ordinal*MEDIA_CHUNK_BYTES))throw new HttpError(400,"Wrong media chunk length.");
    await env.DB.prepare("INSERT INTO social_publish_media_chunks (id,media_id,ordinal,encrypted) VALUES (?,?,?,?) ON CONFLICT(media_id,ordinal) DO NOTHING").bind(`${row.id}:${ordinal}`,row.id,ordinal,await encrypt(String(a.base64),env.TOKEN_ENCRYPTION_KEY)).run();
    const saved=await env.DB.prepare("SELECT encrypted FROM social_publish_media_chunks WHERE media_id=? AND ordinal=?").bind(row.id,ordinal).first<{encrypted:string}>();if(!saved||await decrypt(saved.encrypted,env.TOKEN_ENCRYPTION_KEY)!==a.base64)throw new HttpError(409,"This chunk already contains different data.");return {mediaId:row.id,ordinal,stored:true};
  }
  if(name==="social_publish_media_complete"){
    fields(a,["brandId","mediaId"]);const bytes=await mediaBytes(env,row);if(await hexHash(bytes)!==row.sha256)throw new HttpError(409,"The uploaded image hash does not match.");const size=imageSize(bytes,row.mime);if(size.width<1||size.height<1||size.width*size.height>36000000)throw new HttpError(400,"Image dimensions exceed the supported limit.");await env.DB.prepare("UPDATE social_publish_media SET state='ready',width=?,height=? WHERE id=? AND brand_id=?").bind(size.width,size.height,row.id,brandId).run();return {mediaId:row.id,state:"ready",sha256:row.sha256,...size};
  }
  throw new HttpError(404,"Unknown publishing media action.");
}
async function signingKey(env:Env) {const digest=await crypto.subtle.digest("SHA-256",utf8.encode(`senderdeck-publishing-media-v1:${env.TOKEN_ENCRYPTION_KEY}`));return crypto.subtle.importKey("raw",digest,{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);}
export async function providerMediaUrl(env:Env,media:Media) {if(media.state!=="ready"||media.expires_at<=Date.now())throw new HttpError(409,"Upload fresh, complete publishing media.");const signature=await crypto.subtle.sign("HMAC",await signingKey(env),utf8.encode(`${media.id}:${media.expires_at}`));const encoded=[...new Uint8Array(signature)].map(b=>b.toString(16).padStart(2,"0")).join("");return `${publicOrigin(env)}/api/social/publishing/media/${media.id}/${media.expires_at}/${encoded}`;}
export async function servePublishingMedia(request:Request,env:Env):Promise<Response|null>{
  const path=new URL(request.url).pathname;if(!path.startsWith("/api/social/publishing/media/"))return null;
  const fail=()=>new Response(null,{status:404,headers:{"cache-control":"no-store"}});if(request.method!=="GET")return fail();
  const match=path.match(/^\/api\/social\/publishing\/media\/([a-z0-9-]{36})\/(\d{13})\/([a-f0-9]{64})$/);if(!match||Number(match[2])<=Date.now())return fail();
  const signature=Uint8Array.from(match[3].match(/../g)!,v=>parseInt(v,16));if(!await crypto.subtle.verify("HMAC",await signingKey(env),signature,utf8.encode(`${match[1]}:${match[2]}`)))return fail();
  const row=await env.DB.prepare("SELECT * FROM social_publish_media WHERE id=? AND expires_at=? AND state='ready'").bind(match[1],Number(match[2])).first<Media>();if(!row)return fail();
  const bytes=await mediaBytes(env,row);if(await hexHash(bytes)!==row.sha256)return fail();return new Response(bytes,{headers:{"content-type":row.mime,"content-length":String(row.bytes),"cache-control":"private, no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff","x-robots-tag":"noindex, noarchive"}});
}
