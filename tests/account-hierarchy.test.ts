import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AccountHierarchy from "../app/AccountHierarchy";
import { groupAccountHierarchy, type SocialConnection } from "../app/account-overview-data";

const workspace = { customers: [{ id: "customer", name: "Example organisation" }], brands: [{ id: "brand", customer_id: "customer", name: "Example brand" }, { id: "empty-brand", customer_id: "customer", name: "Another brand" }] };
const accounts: SocialConnection[] = [{ id: "page", provider: "facebook", asset_id: "page-id", name: "Example Page", status: "limited", capabilities: {}, brand: workspace.brands[0] }];

test("account hierarchy retains customer and brand ancestors when an account matches search", () => {
  const groups = groupAccountHierarchy(workspace, accounts, "Example Page");
  assert.equal(groups.length, 1); assert.equal(groups[0].id, "customer");
  assert.deepEqual(groups[0].brands.map(b => b.id), ["brand"]);
  assert.equal(groups[0].brands[0].accounts[0].id, "page");
  assert.equal(groupAccountHierarchy(workspace, accounts, "not present").length, 0);
});

test("hierarchy renders empty brands instead of hiding their parent structure", () => {
  const html = renderToStaticMarkup(createElement(AccountHierarchy, { workspace, accounts, query: "", failedBrandIds: [] }));
  assert.ok(html.indexOf("Example organisation") < html.indexOf("Example brand"));
  assert.ok(html.indexOf("Example brand") < html.indexOf("Example Page"));
  assert.match(html, /Another brand/); assert.match(html, /No social accounts connected to this brand/);
  assert.match(html, /connect\/meta\?brand=empty-brand/);
});

test("a failed brand fetch is not presented as an empty brand to reconnect", () => {
  const html = renderToStaticMarkup(createElement(AccountHierarchy, { workspace: { ...workspace, brands: [workspace.brands[0]] }, accounts: [], query: "", failedBrandIds: ["brand"] }));
  assert.match(html, /connections could not be loaded/);
  assert.doesNotMatch(html, /No social accounts connected|Connect an account to/);
});

test("no accessible workspace explains sign-in scope without exposing another customer's brands", () => {
  const html = renderToStaticMarkup(createElement(AccountHierarchy, { workspace: { customers: [], brands: [] }, accounts: [], query: "", failedBrandIds: [] }));
  assert.match(html, /No customer or brand is available to this sign-in/);
  assert.match(html, /signin\/switch/); assert.doesNotMatch(html, /Try another search|Example brand/);
});
