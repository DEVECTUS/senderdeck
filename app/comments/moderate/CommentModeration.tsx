"use client";
import { useEffect, useState } from "react";
import ProviderIcon from "../../ProviderIcon";
type Brand = { id: string; name: string; role: string };
type Account = { id: string; name: string; provider: string };
type Inspection = { operationId: string; revision: string; approvalToken: string; requiredConfirmation: string; action: "hide" | "unhide"; commentId: string; mediaId: string; text: string; author: string; hidden: boolean; account: { name: string }; brand: { name: string } };
async function api<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, args }) });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || "Request failed."); return body;
}
export default function CommentModeration() {
  const [brands, setBrands] = useState<Brand[]>([]), [brandId, setBrandId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]), [accountId, setAccountId] = useState("");
  const [commentId, setCommentId] = useState(""), [action, setAction] = useState<"hide" | "unhide">("hide");
  const [inspection, setInspection] = useState<Inspection | null>(null), [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [result, setResult] = useState("");
  useEffect(() => { let active = true; void api<{ brands: Brand[] }>("social_workspace_list").then(data => { if (active) setBrands(data.brands.filter(b => ["owner", "admin"].includes(b.role))); }).catch(e => { if (active) setError(String(e.message)); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; setAccounts([]); setAccountId(""); if (brandId) void api<{ accounts: Account[] }>("social_account_list", { brandId }).then(data => { if (active) setAccounts(data.accounts.filter(a => a.provider === "instagram")); }).catch(e => { if (active) setError(String(e.message)); }); return () => { active = false; }; }, [brandId]);
  function reset() { setInspection(null); setApproved(false); setResult(""); setError(""); }
  async function inspect() {
    setBusy(true); reset();
    try { setInspection(await api<Inspection>("social_comment_inspect", { brandId, accountId, commentId, action })); }
    catch (e) { setError(e instanceof Error ? e.message : "Inspection failed."); } finally { setBusy(false); }
  }
  async function apply() {
    if (!inspection || !approved) return; setBusy(true); setError("");
    try {
      const value = await api<{ verified: boolean; hidden: boolean }>("social_comment_moderate", { brandId, accountId, operationId: inspection.operationId, revision: inspection.revision, approvalToken: inspection.approvalToken, confirmed: true, confirmation: inspection.requiredConfirmation });
      setResult(value.verified ? `Verified: comment ${inspection.commentId} is ${value.hidden ? "hidden" : "visible"}.` : "Visibility was not verified.");
    } catch (e) { setError(e instanceof Error ? e.message : "Visibility was not verified. Inspect before retrying."); }
    finally { setInspection(null); setApproved(false); setBusy(false); }
  }
  return <section style={{ maxWidth: 640, margin: "36px auto", padding: "0 16px" }}>
    <a href="/conversations">← Conversations</a><h1 style={{ fontSize: 26 }}>Comment visibility</h1><p>Hide or restore one Instagram comment.</p>
    {error && <p role="alert" className="social-alert">{error}</p>}{result && <p role="status">{result}</p>}
    <div className="social-card" style={{ display: "grid", gap: 16 }}>
      <label>Brand<select disabled={busy} value={brandId} onChange={e => { reset(); setBrandId(e.target.value); }}><option value="">Choose a brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label><span><ProviderIcon provider="instagram" /> Instagram account</span><select disabled={busy || !brandId} value={accountId} onChange={e => { reset(); setAccountId(e.target.value); }}><option value="">Choose an account</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>Comment ID<input disabled={busy} inputMode="numeric" value={commentId} onChange={e => { reset(); setCommentId(e.target.value); }} /></label>
      <label>Action<select disabled={busy} value={action} onChange={e => { reset(); setAction(e.target.value as "hide" | "unhide"); }}><option value="hide">Hide comment</option><option value="unhide">Restore comment</option></select></label>
      <button disabled={busy || !brandId || !accountId || !/^\d{1,32}$/.test(commentId)} onClick={() => void inspect()}>Inspect comment</button>
    </div>
    {inspection && <div className="social-card social-review" style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 20 }}>{inspection.action === "hide" ? "Hide" : "Restore"} this comment?</h2>
      <p>{inspection.brand.name} · {inspection.account.name}</p><blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{inspection.text}</blockquote>
      <p>@{inspection.author} · Currently {inspection.hidden ? "hidden" : "visible"}</p><p className="social-muted">Comment {inspection.commentId} · Media {inspection.mediaId}</p>
      <label className="social-check"><input type="checkbox" checked={approved} disabled={busy} onChange={e => setApproved(e.target.checked)} /> I approve this exact comment and action.</label>
      <button disabled={busy || !approved} onClick={() => void apply()}>{inspection.action === "hide" ? "Hide comment" : "Restore comment"}</button>
    </div>}
  </section>;
}
