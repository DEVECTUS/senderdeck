import type { Metadata } from "next";
import { getSenderDeckUser, safeRelativeReturnPath } from "../../senderdeck-auth";
import SignInScreen from "../../SignInScreen";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Switch sign-in | SenderDeck" };
export default async function SwitchSignInPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const params = await searchParams;
  return <SignInScreen returnTo={safeRelativeReturnPath(params.return_to || "/accounts")} currentUser={await getSenderDeckUser()} />;
}
