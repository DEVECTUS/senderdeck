import type { Metadata } from "next";
import Link from "next/link";
import { requireSenderDeckUser } from "../senderdeck-auth";
import WorkspaceNav from "../WorkspaceNav";
import Conversations from "./Conversations";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conversations | SenderDeck", description: "Manage brands, social access, enquiry review and approved replies." };
export default async function ConversationsPage() {
  const user = await requireSenderDeckUser("/conversations");
  return <main className="social-page">
    <WorkspaceNav source={user.authSource} email={user.email} active="conversations" />
    <Conversations userId={user.userId} />
    <p className="social-muted"><Link href="/comments/moderate">Instagram comment visibility →</Link></p>
    <footer className="social-footer"><span>SenderDeck by DEVECTUS · Human approval before every reply</span><div><Link href="/social-setup">Provider setup</Link><Link href="/privacy">Privacy</Link><Link href="/security">Security</Link></div></footer>
  </main>;
}
