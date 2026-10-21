import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MetaAssetButton, connectionSummary } from "../app/connect/meta/MetaWizard";

test("a saved Meta asset offers an enabled update action for a fresh consent grant", () => {
  const render = (busy: boolean, updated: boolean) => renderToStaticMarkup(createElement(MetaAssetButton, { name: "Example Page", saved: true, busy, updated, onSelect() {} }));
  assert.match(render(false, false), /Update connection/);
  assert.doesNotMatch(render(false, false), /disabled/);
  assert.match(render(true, false), /disabled/);
  assert.match(render(false, true), /disabled/);
  assert.match(render(false, true), /Updated/);
});

test("connection summaries distinguish saved connections from actual read access",()=>{
  const account={id:"a",name:"Example",asset_id:"p",provider:"facebook",status:"limited",capabilities:{messages:"unavailable",comments:"unavailable"}};
  assert.match(connectionSummary(account),/limited access/);
  assert.match(connectionSummary({...account,status:"expired"}),/Sign in to Meta again/);
  assert.equal(connectionSummary({...account,capabilities:{messages:"available",comments:"available"}}),"Messages and comments available.");
});
