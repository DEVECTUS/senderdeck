import assert from "node:assert/strict";
import test from "node:test";
import { createBrandAccountLoader } from "../app/brand-account-loader";

function deferred<T>() { let resolve!: (value:T)=>void, reject!: (error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }

test("a late brand response cannot replace the newly selected brand",async()=>{
  const old=deferred<string[]>(),next=deferred<string[]>();
  const loader=createBrandAccountLoader<string>(brand=>brand==="old"?old.promise:next.promise);
  loader.select("old");const first=loader.refresh("old");loader.select("new");const second=loader.refresh("new");
  next.resolve(["new-account"]);assert.deepEqual(await second,["new-account"]);
  old.resolve(["old-account"]);assert.equal(await first,null);assert.equal(await loader.refresh("old"),null);
});

test("a newer validation refresh wins over an older list response in the same brand",async()=>{
  const old=deferred<string[]>(),next=deferred<string[]>();let reads=0;
  const loader=createBrandAccountLoader<string>(()=>++reads===1?old.promise:next.promise);
  loader.select("brand");const first=loader.refresh("brand"),second=loader.refresh("brand");
  next.resolve(["fresh-validation"]);assert.deepEqual(await second,["fresh-validation"]);
  old.resolve(["stale-validation"]);assert.equal(await first,null);
});

test("obsolete failures are ignored while current failures remain visible",async()=>{
  const old=deferred<string[]>();const loader=createBrandAccountLoader<string>(()=>old.promise);
  loader.select("old");const request=loader.refresh("old");loader.select("new");old.reject(new Error("old failure"));assert.equal(await request,null);
  const current=createBrandAccountLoader<string>(async()=>{throw new Error("current failure");});current.select("new");await assert.rejects(current.refresh("new"),/current failure/);
});
