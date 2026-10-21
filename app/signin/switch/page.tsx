import type { Metadata } from "next";
import { getSenderDeckUser } from "../../senderdeck-auth";
import SignInScreen from "../../SignInScreen";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Switch sign-in | SenderDeck" };
export default async function SwitchSignInPage() {
  return <SignInScreen returnTo="/accounts" currentUser={await getSenderDeckUser()} />;
}
