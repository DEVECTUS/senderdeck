import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MetaAssetButton } from "../app/connect/meta/MetaWizard";

test("a saved Meta asset offers an enabled update action for a fresh consent grant", () => {
  const render = (busy: boolean, updated: boolean) => renderToStaticMarkup(createElement(MetaAssetButton, { name: "Example Page", saved: true, busy, updated, onSelect() {} }));
  assert.match(render(false, false), /Update connection/);
  assert.doesNotMatch(render(false, false), /disabled/);
  assert.match(render(true, false), /disabled/);
  assert.match(render(false, true), /disabled/);
  assert.match(render(false, true), /Updated/);
});
