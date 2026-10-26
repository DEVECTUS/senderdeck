import { HttpError } from "../auth";
import { decrypt, encrypt, sha256Base64Url } from "../crypto";
import type { Env } from "../env";
import { id, json, type HistoryItem, type SocialAccount } from "./model";
import { recordDelivery } from "./monitoring";

type ObjectValue = Record<string, unknown>;
type Change = {field?:string;value?:ObjectValue};
const object = (v:unknown):ObjectValue => v && typeof v === "object" && !Array.isArray(v) ? v as ObjectValue : {};
const digits = (v:unknown) => typeof v === "string" && /^\d{1,32}$/.test(v);
function message(v:unknown) {
  const m=object(v), text=object(m.text), edit=object(m.edit), revoke=object(m.revoke);
  return {id:m.id,from:m.from,to:m.to,timestamp:m.timestamp,type:m.type,
    text:{body:typeof text.body === "string" ? text.body.slice(0,4097) : undefined},
    originalId:edit.original_message_id || revoke.original_message_id};
}
/** Capture signed webhook work durably before acknowledging a large sync batch. */
export async function queueWhatsApp(env:Env, entry:{id?:string;time?:number;changes?:Change[]}) {
  if (!entry.id || !Array.isArray(entry.changes) || entry.changes.length>100) throw new HttpError(400,"Invalid WhatsApp webhook entry.");
  const writes=[];
  for (const change of entry.changes) {
    const field=change.field || "", value=object(change.value), metadata=object(value.metadata);
    if (!["messages","history","smb_app_state_sync","smb_message_echoes","account_update"].includes(field)) continue;
    let accounts:SocialAccount[];
    if (field === "account_update") {
      if (!["PARTNER_REMOVED","ACCOUNT_OFFBOARDED"].includes(String(value.event))) continue;
      accounts=(await env.DB.prepare("SELECT a.* FROM social_accounts a JOIN social_whatsapp_coexistence c ON c.account_id=a.id WHERE a.provider='whatsapp' AND a.parent_id=? AND (?='' OR c.phone=?)").bind(entry.id,String(value.phone_number||"").replace(/\D/g,""),String(value.phone_number||"").replace(/\D/g,"")).all<SocialAccount>()).results;
    } else {
      if (!digits(metadata.phone_number_id) || value.messaging_product !== "whatsapp") continue;
      accounts=(await env.DB.prepare("SELECT * FROM social_accounts WHERE provider='whatsapp' AND asset_id=? AND parent_id=? AND status!='revoked'").bind(metadata.phone_number_id,entry.id).all<SocialAccount>()).results;
    }
    for (const account of accounts) {
      if (field !== "messages" && field !== "account_update" && !await env.DB.prepare("SELECT account_id FROM social_whatsapp_coexistence WHERE account_id=? AND status!='offboarded'").bind(account.id).first()) continue;
      const chunks:ObjectValue[]=[];
      if (field === "messages" || field === "smb_message_echoes") {
        const rows=value[field === "messages" ? "messages" : "message_echoes"];
        if (rows !== undefined && !Array.isArray(rows)) throw new HttpError(400,"Invalid WhatsApp messages.");
        for(let i=0;i<(rows as unknown[]||[]).length;i+=50) chunks.push({messages:(rows as unknown[]).slice(i,i+50).map(message)});
      } else if (field === "smb_app_state_sync") {
        if (!Array.isArray(value.state_sync)) throw new HttpError(400,"Invalid contacts sync payload.");
        // Contacts sync is required by Meta. Persist receipt/count only, never
        // import phone address books into unrelated customer identity records.
        chunks.push({contactCount:value.state_sync.length});
      } else if (field === "history") {
        if (!Array.isArray(value.history)) throw new HttpError(400,"Invalid history sync payload.");
        for(const raw of value.history) {
          const h=object(raw), meta=object(h.metadata);
          const progress=Number.isInteger(meta.progress)&&Number(meta.progress)>=0&&Number(meta.progress)<=100?Number(meta.progress):0;
          if (Array.isArray(h.errors)) {chunks.push({errors:h.errors.map(e=>Number(object(e).code)),progress});continue;}
          if (!Array.isArray(h.threads)) throw new HttpError(400,"Invalid history threads.");
          if (!h.threads.length) chunks.push({messages:[],progress});
          for(const thread of h.threads) {
            const t=object(thread);
            if(!digits(t.id)||!Array.isArray(t.messages))throw new HttpError(400,"Invalid history thread identity.");
            for(let i=0;i<t.messages.length;i+=50)chunks.push({peer:t.id,messages:t.messages.slice(i,i+50).map(message),progress});
          }
        }
      } else {
        const enrollment=await env.DB.prepare("SELECT created_at FROM social_whatsapp_coexistence WHERE account_id=?").bind(account.id).first<{created_at:number}>();
        const at=Number(entry.time)*1000;
        chunks.push({event:value.event,generation:enrollment?.created_at,at:Number.isFinite(at)&&at>0?at:null});
      }
      for(const chunk of chunks) {
        const payload={whatsapp:{field,...chunk}}, serialised=JSON.stringify(payload);
        const eventId=await sha256Base64Url(`${account.id}:${serialised}`);
        writes.push(env.DB.prepare("INSERT OR IGNORE INTO social_queue (id,account_id,encrypted,state,created_at,expires_at) VALUES (?,?,?,'pending',?,?)").bind(eventId,account.id,await encrypt(serialised,env.TOKEN_ENCRYPTION_KEY),Date.now(),Date.now()+86400000));
        if(writes.length>=40){await env.DB.batch(writes.splice(0));}
      }
    }
  }
  if(writes.length)await env.DB.batch(writes);
}
export async function processWhatsAppEvent(env:Env, accountId:string, event:ObjectValue, sourceId="unknown") {
  const account=await env.DB.prepare("SELECT a.*,b.profile FROM social_accounts a JOIN social_brands b ON b.id=a.brand_id WHERE a.id=? AND a.provider='whatsapp'").bind(accountId).first<SocialAccount&{profile:string}>();
  if(!account)return;
  const field=event.field, historical=field === "history", echo=field === "smb_message_echoes";
  if(field === "account_update") {
    const enrollment=await env.DB.prepare("SELECT created_at FROM social_whatsapp_coexistence WHERE account_id=?").bind(account.id).first<{created_at:number}>();
    if(!enrollment||event.generation!==enrollment.created_at||typeof event.at==="number"&&event.at+999<enrollment.created_at)return;
    await env.DB.batch([
      env.DB.prepare("UPDATE social_accounts SET status='revoked',validated_at=NULL WHERE id=?").bind(account.id),
      env.DB.prepare("UPDATE social_whatsapp_coexistence SET status='offboarded',updated_at=? WHERE account_id=?").bind(Date.now(),account.id),
      env.DB.prepare("UPDATE social_drafts SET state='superseded',approval_hash=NULL WHERE state='draft' AND thread_id IN (SELECT id FROM social_threads WHERE account_id=?)").bind(account.id),
    ]);return;
  }
  if(account.status === "revoked")return;
  if(field === "smb_app_state_sync") {
    await env.DB.prepare("UPDATE social_whatsapp_coexistence SET contacts_state='received',updated_at=? WHERE account_id=? AND status!='offboarded'").bind(Date.now(),account.id).run();return;
  }
  const state=await env.DB.prepare("SELECT phone FROM social_whatsapp_coexistence WHERE account_id=? AND status!='offboarded'").bind(account.id).first<{phone:string}>();
  if(historical && Array.isArray(event.errors)) {
    await env.DB.prepare("UPDATE social_whatsapp_coexistence SET history_state=?,status=CASE WHEN ?='failed' THEN 'needs_review' ELSE status END,updated_at=? WHERE account_id=? AND status!='offboarded'").bind(event.errors.includes(2593109)?"declined":"failed",event.errors.includes(2593109)?"declined":"failed",Date.now(),account.id).run();return;
  }
  const days=Math.max(1,Math.min(90,json<{retentionDays:number}>(account.profile).retentionDays));
  for(const raw of Array.isArray(event.messages)?event.messages:[]) {
    const m=object(raw), at=Number(m.timestamp)*1000;
    if(typeof m.id!=="string"||!m.id||m.id.length>300||!Number.isFinite(at)||at<=0||at>Date.now()+60000)continue;
    const outgoing=echo || historical&&state?.phone===m.from;
    const peer=historical?event.peer:echo?m.to:m.from;
    if(!digits(peer)||!digits(m.from)||historical&&m.from!==peer&&m.from!==state?.phone||echo&&m.from!==state?.phone){
      await env.DB.prepare("INSERT OR IGNORE INTO social_threads (id,account_id,provider_id,kind,target,status,next_action,updated_at) VALUES (?,?,?,'message','','escalated','Review unsupported WhatsApp identity in the phone app before resolving this enquiry',?)").bind(id(),account.id,`native-review:${sourceId}`,Date.now()).run();
      continue;
    }
    const expiry=at+days*86400000;if(expiry<=Date.now())continue;
    const text=object(m.text), readable=m.type === "text"&&typeof text.body === "string"&&text.body.length<=4096;
    const item:HistoryItem={id:m.id,from:outgoing?account.asset_id:String(peer),at,text:readable?String(text.body):"[WhatsApp media, edited, deleted or unsupported message: review in WhatsApp]",attachments:!readable,responseWindowEligible:!historical&&!outgoing&&m.type!=="edit"&&m.type!=="revoke"};
    const duplicate=await env.DB.prepare("SELECT provider_id FROM social_whatsapp_messages WHERE account_id=? AND provider_id=?").bind(account.id,item.id).first();if(duplicate)continue;
    const writes=[env.DB.prepare("INSERT OR IGNORE INTO social_whatsapp_messages (account_id,provider_id,peer,sent_at,encrypted,expires_at) VALUES (?,?,?,?,?,?)").bind(account.id,item.id,peer,at,await encrypt(JSON.stringify(item),env.TOKEN_ENCRYPTION_KEY),expiry)];
    if((m.type === "edit"||m.type === "revoke")&&typeof m.originalId === "string") {
      const original=await env.DB.prepare("SELECT encrypted FROM social_whatsapp_messages WHERE account_id=? AND provider_id=? AND peer=?").bind(account.id,m.originalId,peer).first<{encrypted:string}>();
      if(original){const old=json<HistoryItem>(await decrypt(original.encrypted,env.TOKEN_ENCRYPTION_KEY));writes.push(env.DB.prepare("UPDATE social_whatsapp_messages SET encrypted=? WHERE account_id=? AND provider_id=? AND peer=?").bind(await encrypt(JSON.stringify({...old,text:item.text,attachments:true}),env.TOKEN_ENCRYPTION_KEY),account.id,m.originalId,peer));}
    }
    // Only live incoming messages establish the Cloud API response window.
    const inbound=item.responseWindowEligible?at:null;
    writes.push(env.DB.prepare("INSERT INTO social_threads (id,account_id,provider_id,kind,target,status,next_action,last_inbound_at,updated_at) VALUES (?,?,?,'message',?,'new','Review WhatsApp history',?,?) ON CONFLICT(account_id,provider_id,kind) DO UPDATE SET last_inbound_at=MAX(COALESCE(last_inbound_at,0),COALESCE(excluded.last_inbound_at,0)),updated_at=excluded.updated_at,status='new'").bind(id(),account.id,peer,peer,inbound,Date.now()));
    writes.push(env.DB.prepare("INSERT OR IGNORE INTO social_notices (id,account_id,reason,fingerprint,created_at) VALUES (?,?,'whatsapp_conversation_changed_requires_review',?,?)").bind(id(),account.id,`whatsapp:${item.id}`,Date.now()));
    await env.DB.batch(writes);
    if(!historical&&!outgoing)await recordDelivery(env,account.id,"messages");
  }
  if(historical)await env.DB.prepare("UPDATE social_whatsapp_coexistence SET history_progress=MAX(history_progress,?),history_state=CASE WHEN ?=100 THEN 'received' ELSE history_state END,updated_at=? WHERE account_id=? AND status!='offboarded'").bind(event.progress||0,event.progress||0,Date.now(),account.id).run();
}
