import { HttpError } from "../auth";
import { json, str, type BrandProfile, type History } from "./model";

const escalationTerms = ["injury", "injured", "unsafe", "accident", "safety", "lawyer", "legal", "privacy", "personal data", "chargeback", "payment dispute", "serious complaint", "refund", "warranty", "price", "pricing", "cost", "suitable", "suitability", "load capacity"];
export function defaultProfile(pilot = false): BrandProfile {
  return {
    language: pilot ? "Australian English" : "English", tone: "Brief, warm and professional", maxReplyLength: 800,
    forbidDashes: pilot, verifiedFacts: [], approvedReplies: [],
    verifiedUrls: pilot ? ["https://car-turntable.com.au/"] : [], escalationTerms: [...escalationTerms],
    identityResponse: "", avoidUnsolicitedAi: pilot, sendEnabled: false, retentionDays: 30,
  };
}
export function validateProfile(input: unknown): BrandProfile {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "A brand profile is required.");
  const p = input as BrandProfile;
  const arrays = [p.verifiedFacts, p.approvedReplies, p.verifiedUrls, p.escalationTerms];
  if (arrays.some(a => !Array.isArray(a) || a.length > 100)) throw new HttpError(400, "Invalid brand profile lists.");
  const urls = p.verifiedUrls.map(u => {
    let url: URL;
    try { url = new URL(str(u, "verified URL", 1000)); } catch { throw new HttpError(400, "Verified URLs must be valid HTTPS URLs."); }
    if (url.protocol !== "https:" || url.username || url.password) throw new HttpError(400, "Verified URLs must use HTTPS.");
    return u;
  });
  if (![true, false].includes(p.forbidDashes) || ![true, false].includes(p.avoidUnsolicitedAi) || ![true, false].includes(p.sendEnabled)) throw new HttpError(400, "Invalid policy switches.");
  if (!Number.isInteger(p.maxReplyLength) || p.maxReplyLength < 40 || p.maxReplyLength > 4000 || !Number.isInteger(p.retentionDays) || p.retentionDays < 1 || p.retentionDays > 90) throw new HttpError(400, "Reply length or retention is outside allowed limits.");
  return { language: str(p.language, "language", 80), tone: str(p.tone, "tone", 300), maxReplyLength: p.maxReplyLength,
    forbidDashes: p.forbidDashes, verifiedFacts: p.verifiedFacts.map(f => ({id: str(f.id, "fact ID", 80), text: str(f.text, "verified fact", 2000), source: str(f.source, "fact source", 1000)})),
    approvedReplies: p.approvedReplies.map(r => str(r, "approved reply", 4000)), verifiedUrls: urls,
    escalationTerms: p.escalationTerms.map(t => str(t, "escalation term", 80).toLowerCase()),
    identityResponse: typeof p.identityResponse === "string" ? p.identityResponse.slice(0, 1000) : "",
    avoidUnsolicitedAi: p.avoidUnsolicitedAi, sendEnabled: p.sendEnabled, retentionDays: p.retentionDays };
}
export function assess(profile: BrandProfile, text: string, history: History) {
  const blockers: string[] = [];
  if (text.length > profile.maxReplyLength) blockers.push("reply_exceeds_brand_length");
  let withoutUrls = text;
  for (const url of profile.verifiedUrls) withoutUrls = withoutUrls.split(url).join("");
  if (profile.forbidDashes && /[-\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/u.test(withoutUrls)) blockers.push("brand_disallows_dashes");
  const inbound = history.items.map(i => i.text).join("\n").toLowerCase();
  const escalation = profile.escalationTerms.filter(t => inbound.includes(t.toLowerCase()));
  if (escalation.length) blockers.push("escalation_requires_owner_handling");
  if (/are you (?:an? |a real )?(?:ai|bot|human|person)|who are you|who am i (?:speaking|talking)|is this (?:an? )?(?:ai|bot|human)|(?:your|whose) (?:name|identity)/i.test(inbound)) {
    if (!profile.identityResponse || text !== profile.identityResponse) blockers.push("identity_question_requires_truthful_approved_response");
  } else if (profile.avoidUnsolicitedAi && /\b(?:artificial intelligence|ai|chatbot|language model)\b/i.test(text)) blockers.push("unsolicited_ai_reference");
  // Policy text and keyword checks cannot prove a generated claim. Only owner-approved
  // exact wording is sendable in this release; all other suggestions stay drafts.
  const approved = [...profile.approvedReplies, ...profile.verifiedFacts.map(f => f.text), profile.identityResponse].filter(Boolean);
  if (!approved.includes(text)) blockers.push("wording_requires_brand_admin_approval");
  if (!history.coverage.complete) blockers.push("incomplete_history");
  if (history.items.some(i => i.attachments)) blockers.push("attachments_require_native_review");
  if (!history.owned) blockers.push("thread_owned_by_another_application_or_unknown");
  return { blockers, escalation, sendable: blockers.length === 0 };
}
export function profileOf(value: string) { return json<BrandProfile>(value); }
