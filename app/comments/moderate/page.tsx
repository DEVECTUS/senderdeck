import type { Metadata } from "next";
import WorkspaceNav from "../../WorkspaceNav";
import { requireSenderDeckUser } from "../../senderdeck-auth";
import CommentModeration from "./CommentModeration";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comment visibility | SenderDeck", robots: { index: false, follow: false } };
export default async function CommentModerationPage() {
  const user = await requireSenderDeckUser("/comments/moderate");
  return <main className="social-page"><WorkspaceNav source={user.authSource} email={user.email} active="conversations" /><CommentModeration /></main>;
}
