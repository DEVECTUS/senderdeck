import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MetaAssetButton, MetaAssetConnection, connectionSummary } from "../app/connect/meta/MetaWizard";

test("a saved Meta asset offers an enabled update action for a fresh consent grant", () => {
  const render = (busy: boolean, updated: boolean) => renderToStaticMarkup(createElement(MetaAssetButton, { name: "Example Page", saved: true, busy, updated, onSelect() {} }));
  assert.match(render(false, false), /Update connection/);
  assert.doesNotMatch(render(false, false), /disabled/);
  assert.match(render(true, false), /disabled/);
  assert.match(render(false, true), /disabled/);
  assert.match(render(false, true), /Updated/);
});

test("existing assignments offer the permitted workspace or identity switch without disconnecting",()=>{
  const render=(assignment:{state:"other_brand"|"other_workspace";brandId?:string;brandName?:string})=>renderToStaticMarkup(createElement(MetaAssetConnection,{asset:{name:"Example Page",provider:"facebook",assetId:"asset",assignment},saved:false,busy:false,updated:false,onSelect(){throw new Error("must not reconnect");}}));
  const visible=render({state:"other_brand",brandId:"brand-a",brandName:"Existing brand"});assert.match(visible,/Open existing workspace/);assert.match(visible,/brand=brand-a/);assert.doesNotMatch(visible,/<button|Disconnect|fresh sign-in/);
  const hidden=render({state:"other_workspace"});assert.match(hidden,/Connected in another workspace/);assert.match(hidden,/\/signin\/switch/);assert.doesNotMatch(hidden,/<button|brand-a|Existing brand|Disconnect|fresh sign-in/);
});

test("connection summaries distinguish saved connections from actual read access",()=>{
  const account={id:"a",name:"Example",asset_id:"p",provider:"facebook",status:"limited",capabilities:{messages:"unavailable",comments:"unavailable"}};
  assert.match(connectionSummary(account),/limited access/);
  assert.match(connectionSummary({...account,status:"expired"}),/Sign in to Meta again/);
  assert.equal(connectionSummary({...account,capabilities:{messages:"available",comments:"available"}}),"Messages and comments available.");
});
