"use client";
import { useEffect, useRef, useState } from "react";

type Setup={configured:boolean;appId:string|null;configId:string|null;graphVersion:string};
type Session=Setup&{state:string;expectedPhone:string};
type Result={accountId?:string;queuedEvents:number;coexistence:{status:string;contacts_state:string;history_state:string;history_progress:number}|null};
type FacebookSdk={init:(args:Record<string,unknown>)=>void;login:(callback:(result:{authResponse?:{code?:string}})=>void,args:Record<string,unknown>)=>void};
declare global {interface Window {FB?:FacebookSdk;fbAsyncInit?:()=>void}}
async function request<T>(operation:string,args?:Record<string,unknown>):Promise<T>{
  const response=await fetch(`/api/social/whatsapp/coexistence/${operation}`,args?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(args)}:{cache:"no-store"});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"The WhatsApp connection could not be completed.");return data;
}
let sdkLoading:Promise<void>|undefined;
function loadSdk(){
  if(window.FB)return Promise.resolve();
  return sdkLoading ||= new Promise<void>((resolve,reject)=>{
    const script=document.createElement("script");script.id="senderdeck-facebook-sdk";script.src="https://connect.facebook.net/en_US/sdk.js";script.async=true;
    const timeout=setTimeout(()=>{sdkLoading=undefined;reject(new Error("Meta's login SDK did not load. Reload this page before trying again."));},20000);
    window.fbAsyncInit=()=>{clearTimeout(timeout);resolve();};
    script.onerror=()=>{clearTimeout(timeout);sdkLoading=undefined;reject(new Error("Meta's login SDK could not be loaded."));};document.head.appendChild(script);
  });
}
export default function WhatsAppCoexistence({brandId}:{brandId:string}){
  const [setup,setSetup]=useState<Setup|null>(null),[phone,setPhone]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [session,setSession]=useState<Session|null>(null),[result,setResult]=useState<Result|null>(null);
  const active=useRef<Session|null>(null),code=useRef(""),waba=useRef(""),completing=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;setPhone(new URLSearchParams(location.search).get("phone")||"");void request<Setup>("setup").then(setSetup).catch(e=>setError(e.message));return()=>{mounted.current=false;active.current=null;code.current="";waba.current="";};},[]);
  const finish=async()=>{
    if(!active.current||!code.current||!waba.current||completing.current)return;
    const current=active.current;completing.current=true;setBusy(true);setError("");
    try{const connected=await request<Result>("complete",{brandId,state:current.state,code:code.current,wabaId:waba.current,event:"FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"});if(mounted.current)setResult(connected);}
    catch(e){if(mounted.current)setError(e instanceof Error?e.message:"The connection needs review. Restart only after checking its current state.");}
    finally{active.current=null;code.current="";waba.current="";if(mounted.current){setBusy(false);setSession(null);}}
  };
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(!active.current||!["https://www.facebook.com","https://web.facebook.com"].includes(event.origin)||!event.source)return;
      let data;try{data=typeof event.data==="string"&&event.data.length<20000?JSON.parse(event.data):typeof event.data==="object"?event.data:null;}catch{return;}
      if(data?.type!=="WA_EMBEDDED_SIGNUP")return;
      if(data.event==="FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"&&typeof data.data?.waba_id==="string"&&/^\d{1,32}$/.test(data.data.waba_id)){waba.current=data.data.waba_id;void finish();}
      else if(["CANCEL","ERROR"].includes(data.event)){code.current="";waba.current="";active.current=null;setSession(null);setError("Meta's onboarding was cancelled or failed. Your phone app has not been migrated by SenderDeck.");}
      else if(data.event==="FINISH"){setError("Meta returned a Cloud API signup instead of Business app Coexistence. No number was connected. Ask the platform operator to check the Embedded Signup configuration.");active.current=null;code.current="";waba.current="";setSession(null);}
    };
    window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);
    // The component is keyed by brand; refs keep callback/event arrival order independent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[brandId]);
  return <section className="social-card"><h2>Keep using WhatsApp Business on your phone</h2>
    <p className="connection-note">This connects WhatsApp messaging. SenderDeck does not change your phone provider’s voice or SMS configuration. Meta may change WhatsApp features as described below.</p>
    <p>Connect the existing Business app number through Meta’s Coexistence flow. Confirm the connection in WhatsApp Business on your phone when Meta asks. SenderDeck will verify the exact number and simultaneous Business app / Cloud API registration.</p>
    <p>Meta may unlink companion devices and change features such as broadcasts and disappearing messages. Review <a href="https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users" target="_blank" rel="noreferrer">Meta’s feature changes</a> before approving. SenderDeck never registers, deregisters or migrates your phone number.</p>
    <p>Keep the Business app open during initial sync. Message history is retained under your brand’s retention period; contacts sync is acknowledged without importing your phone address book. Sharing history is your choice in Meta. Templates and media sending remain unavailable.</p>
    {error&&<p role="alert">{error}</p>}
    {setup&&!setup.configured&&<p role="status">Coexistence configuration is pending. The operator must complete Meta Tech Provider access and configure a separate WhatsApp Embedded Signup flow. Your existing phone app is unchanged.</p>}
    {result?<><p role="status">Meta verified Coexistence. Connection state: {result.coexistence?.status||"needs review"}. Contacts: {result.coexistence?.contacts_state||"unverified"}. History: {result.coexistence?.history_state||"unverified"} ({result.coexistence?.history_progress||0}% reported). Queued events: {result.queuedEvents}.</p>
      <p>Request acceptance does not establish complete history or live delivery. Replies retain exact draft approval and the 24-hour response window.</p>
      <button disabled={busy} onClick={()=>{setBusy(true);void request<Result>("status",{brandId,accountId:result.accountId}).then(r=>setResult({...r,accountId:result.accountId})).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Refresh sync status</button>
      {result.coexistence&&["needs_review","onboarding"].includes(result.coexistence.status)&&<button disabled={busy} onClick={()=>{setBusy(true);void request<Result>("resume",{brandId,accountId:result.accountId,confirmed:true}).then(setResult).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Repair subscription and start only unrequested sync steps</button>}
      <a href={`/conversations?brand=${encodeURIComponent(brandId)}&account=${encodeURIComponent(result.accountId||"")}`}>Open brand conversations →</a></>:<>
      <fieldset disabled={busy||!!session}><label>Business app phone number, including country code<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
      <label className="social-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I want to connect this existing Business app number and request the data sync allowed by my choices in Meta. I have reviewed the phone-app feature changes.</label></fieldset>
      {!session?<button disabled={busy||!brandId||!setup?.configured||!confirmed||!phone.trim()} onClick={()=>{setBusy(true);setError("");void request<Session>("start",{brandId,phone,confirmed}).then(async prepared=>{await loadSdk();window.FB!.init({appId:prepared.appId,version:prepared.graphVersion,xfbml:false,autoLogAppEvents:false});active.current=prepared;code.current="";waba.current="";completing.current=false;setSession(prepared);}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Prepare secure Meta connection</button>:
        <button disabled={busy} onClick={()=>{setError("");window.FB!.login(response=>{if(!active.current)return;const returned=response.authResponse?.code;if(typeof returned==="string"){code.current=returned;void finish();}else{setError("Meta did not return an authorization code. Restart the connection.");active.current=null;setSession(null);}},{config_id:session.configId,response_type:"code",override_default_response_type:true,extras:{setup:{},featureType:"whatsapp_business_app_onboarding",sessionInfoVersion:"3"}});}}>Connect existing WhatsApp Business app</button>}
    </>}
  </section>;
}
