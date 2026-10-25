"use client";
import { useEffect, useState } from "react";
type Asset = {assetId:string;name:string;assignment:{state:string}};
async function action<T>(name:string,args:Record<string,unknown>):Promise<T> {
  const response=await fetch("/api/social",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:name,args})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||"Please try again.");return result;
}
export default function WhatsAppWizard(){
  const [brands,setBrands]=useState<Array<{id:string;name:string}>>([]),[brandId,setBrandId]=useState(""),[grantId,setGrantId]=useState("");
  const [wabaId,setWabaId]=useState(""),[assets,setAssets]=useState<Asset[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Please try again.");}finally{setBusy(false);}};
  useEffect(()=>{const query=new URLSearchParams(location.search);setBrandId(query.get("brand")||"");setGrantId(query.get("grant")||"");if(query.get("connection"))setError("Authorisation was cancelled, expired or failed. Please restart the connection.");void action<{brands:Array<{id:string;name:string}>}>("social_workspace_list",{}).then(r=>setBrands(r.brands)).catch(e=>setError(e.message));},[]);
  return <div className="setup-wizard meta-connect"><header><a href="/accounts">← Accounts</a><h1>Connect WhatsApp Business</h1><p>Connect an existing WhatsApp Business Platform Cloud API number to a brand.</p></header>
    <p>Messages received through signed webhooks are encrypted and kept under the brand’s retention policy. Older or missed messages cannot be fetched. Text replies use the existing draft, inspection and explicit approval workflow within the 24-hour reply window. Templates and media sending are unavailable.</p>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <fieldset disabled={busy}><label>Brand<select value={brandId} disabled={!!grantId} onChange={e=>{setBrandId(e.target.value);setAssets([]);}}><option value="">Choose a brand</option>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    {!grantId?<button disabled={!brandId} onClick={()=>void run(async()=>{const result=await action<{authorizationUrl:string}>("social_account_connect",{brandId,provider:"whatsapp"});location.assign(result.authorizationUrl);})}>Continue with Meta</button>:<>
      <label>WhatsApp Business Account ID<input value={wabaId} inputMode="numeric" onChange={e=>{setWabaId(e.target.value);setAssets([]);}}/></label><p>Find this ID in WhatsApp Manager. Only phone numbers accessible through your current authorisation can be selected.</p>
      <button disabled={!/^\d{1,32}$/.test(wabaId)} onClick={()=>void run(async()=>{const result=await action<{assets:Asset[]}>("social_asset_list",{brandId,grantId,kind:"whatsapp",wabaId});setAssets(result.assets);if(!result.assets.length)setMessage("No accessible business phone numbers were returned.");})}>Find business numbers</button>
      {assets.map(asset=><article className="social-account" key={asset.assetId}><strong>{asset.name}</strong><p>{asset.assetId}</p><button disabled={!["available","this_brand"].includes(asset.assignment.state)} onClick={()=>void run(async()=>{const result=await action<{validation:{webhook:boolean}}>("social_asset_select",{brandId,grantId,provider:"whatsapp",assetId:asset.assetId,wabaId});setMessage(result.validation.webhook?"Number connected. Send a test inbound message to verify delivery before use.":"Number connected. The platform operator must subscribe the WhatsApp Business account to this app before replies can be sent.");})}>{asset.assignment.state === "this_brand"?"Reconnect":"Connect number"}</button></article>)}
      <a href={`/connect/meta?provider=whatsapp&brand=${encodeURIComponent(brandId)}`}>Restart authorisation</a>
    </>}</fieldset><p><a href={`/conversations?brand=${encodeURIComponent(brandId)}`}>Open brand conversations →</a></p></div>;
}
