import type { Metadata } from "next";
import Link from "next/link";
import { requireSenderDeckUser, senderDeckSignOutPath } from "../senderdeck-auth";
import Conversations from "./Conversations";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conversations | SenderDeck", description: "Manage brands, social access, enquiry review and approved replies." };
export default async function ConversationsPage() {
  const user = await requireSenderDeckUser("/conversations");
  return <main className="social-page">
    <nav><Link className="wordmark" href="/">SenderDeck<span className="social-nav-tag">CONVERSATIONS</span></Link><div className="nav-user"><span>{user.email}</span><Link href="/settings">Email accounts</Link><a href={senderDeckSignOutPath("/")}>Sign out</a></div></nav>
    <Conversations userId={user.userId} />
    <footer className="social-footer"><span>SenderDeck by DEVECTUS · Human approval before every reply</span><div><Link href="/social-setup">Provider setup</Link><Link href="/privacy">Privacy</Link><Link href="/security">Security</Link></div></footer>
  </main>;
}
