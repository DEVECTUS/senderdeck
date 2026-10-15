import { HttpError } from "../auth";
import type { SenderIdentity, StoredAccount } from "../env";
import { senderAddress } from "../sender-address";
import { providerJson } from "./shared";

interface GmailSendAs {
  sendAsEmail: string;
  displayName?: string;
  isPrimary?: boolean;
  isDefault?: boolean;
  verificationStatus?: string;
}

// Read on demand, never cache authorisation. Do not request or expose signatures,
// reply-to settings or SMTP configuration as part of sender discovery.
export async function listGoogleSenders(token: string): Promise<SenderIdentity[]> {
  const result = await providerJson<{ sendAs?: GmailSendAs[] }>(
    "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs?fields=sendAs(sendAsEmail,displayName,isPrimary,isDefault,verificationStatus)", token,
  );
  if (!Array.isArray(result.sendAs)) throw new HttpError(502, "Gmail did not return send-as identities. Try again before choosing an alias.");
  return result.sendAs
    // Gmail's verificationStatus applies only to custom From addresses.
    .filter((identity) => identity.isPrimary === true || identity.verificationStatus === "accepted")
    .map((identity) => ({
      email: senderAddress(identity.sendAsEmail),
      displayName: identity.displayName || "",
      isPrimary: identity.isPrimary === true,
      isDefault: identity.isDefault === true,
    }));
}

export async function authorisedGoogleSender(token: string, account: StoredAccount, from: string): Promise<string> {
  const requested = senderAddress(from);
  const identity = (await listGoogleSenders(token)).find((item) => item.email === requested);
  if (!identity) throw new HttpError(403, `From address ${requested} is not an authorised Gmail send-as identity for ${account.email}. Choose a current verified identity from account_list.`);
  return identity.email;
}
