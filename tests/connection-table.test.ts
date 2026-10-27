import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ConnectionTable, { connectionStatus } from "../app/ConnectionTable";
import type { SocialConnection } from "../app/account-overview-data";

const brand = {id:"brand",name:"Example brand",customer_id:"customer"};
const workspace = {customers:[{id:"customer",name:"Example company"}],brands:[brand,{...brand,id:"failed",name:"Unavailable brand"}]};
const accounts: SocialConnection[] = [
  {id:"page",name:"Example Page",provider:"facebook",asset_id:"page-id",brand,status:"connected",capabilities:{messages:"available",comments:"unavailable"}},
  {id:"phone",name:"Business phone",provider:"whatsapp",asset_id:"phone-id",brand,status:"expired",capabilities:{messages:"available",comments:"unavailable"}},
];
const emails = [{id:"mail",provider:"google",email:"owner@example.com",label:"Personal email"}];

test("table shows actual account names, brands, statuses and scoped management links without setup cards", () => {
  const html = renderToStaticMarkup(createElement(ConnectionTable,{emails,accounts,workspace}));
  for (const value of ["Personal email","owner@example.com","Example Page","Business phone","Example brand","Example company","Limited access","Reconnect","Connected"]) assert.ok(html.includes(value),value);
  assert.match(html, /<table[^>]*aria-label="Connected accounts"/);
  assert.equal((html.match(/<tr>/g)||[]).length,4);
  assert.ok(html.includes('/settings#account-mail'));
  assert.ok(html.includes('/conversations?brand=brand&amp;account=phone&amp;tab=Connections'));
  assert.doesNotMatch(html, /channel-card|<article|Add connection/);
});

test("account table search and channel filter retain real rows and report unavailable brands separately", () => {
  const selected = renderToStaticMarkup(createElement(ConnectionTable,{emails,accounts,workspace,provider:"whatsapp",query:"Example company"}));
  assert.match(selected, /Business phone/);assert.doesNotMatch(selected,/Example Page|Personal email/);
  const failed = renderToStaticMarkup(createElement(ConnectionTable,{emails:[],accounts:[],workspace,failedBrandIds:["failed"]}));
  assert.match(failed,/Unavailable brand/);assert.match(failed,/Accounts not loaded/);assert.doesNotMatch(failed,/No connections loaded|Not connected/);
});

test("saved social connections do not conceal revoked, unverified or unavailable access", () => {
  const account = {provider:"facebook",status:"connected",capabilities:{messages:"unavailable",comments:"unavailable"}};
  assert.equal(connectionStatus(account).label,"Access unavailable");
  assert.equal(connectionStatus({...account,capabilities:{}}).label,"Needs check");
  assert.equal(connectionStatus({...account,status:"revoked"}).label,"Reconnect");
  assert.equal(connectionStatus({...account,status:"pending_validation"}).label,"Needs check");
  assert.equal(connectionStatus({...account,provider:"whatsapp",capabilities:{messages:"available",comments:"unavailable"}}).label,"Connected");
});
