import type { Metadata } from "next";
import WorkspaceNav from "../../WorkspaceNav";
import { requireSenderDeckUser } from "../../senderdeck-auth";
import MetaWizard from "./MetaWizard";
import WhatsAppWizard from "./WhatsAppWizard";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect Meta accounts | SenderDeck", description: "Choose your brand, authorise Meta and verify the business accounts you select." };
type SetupQuery = { provider?: string; brand?: string; grant?: string; connection?: string; mode?: string };
export default async function MetaConnectPage({ searchParams }: { searchParams: Promise<SetupQuery> }) {
  const query = await searchParams;
  const retained = new URLSearchParams();
  for (const key of ["provider", "brand", "grant", "connection", "mode"] as const) {
    const value = query[key];
    if (typeof value === "string") retained.set(key, value);
  }
  const user = await requireSenderDeckUser(`/connect/meta${retained.size ? `?${retained}` : ""}`);
  const initialBrandId = typeof query.brand === "string" ? query.brand : "";
  const channel = query.provider === "facebook" || query.provider === "instagram" ? query.provider : "meta";
  return <main className="social-page"><WorkspaceNav source={user.authSource} email={user.email} active="accounts" />
    {query.provider === "whatsapp" ? <WhatsAppWizard initialBrandId={initialBrandId}/> : <MetaWizard key={channel} channel={channel} initialBrandId={initialBrandId}/>}
  </main>;
}
