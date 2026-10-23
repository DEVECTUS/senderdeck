"use client";
import { useRef, useState } from "react";
export default function CopyValue({ label, value }: { label: string; value: string }) {
  const [message, setMessage] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  return <div className="install-copy">
    <label><span>{label}</span><textarea ref={input} aria-label={label} readOnly value={value} rows={value.split("\n").length} onFocus={event => event.currentTarget.select()} /></label>
    <button type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(value); setMessage("Copied"); }
      catch { input.current?.focus(); input.current?.select(); setMessage("Text selected. Copy it using your browser."); }
    }} aria-label={`Copy ${label}`}>Copy</button>
    <span role="status" aria-live="polite">{message}</span>
  </div>;
}
