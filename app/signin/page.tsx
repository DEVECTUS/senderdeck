import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSenderDeckUser, safeRelativeReturnPath } from "../senderdeck-auth";
import SignInScreen from "../SignInScreen";
export const metadata: Metadata = { title: "Sign in | SenderDeck", description: "Choose the provider identity for your SenderDeck workspace." };
export const dynamic = "force-dynamic";
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ return_to?: string; error?: string }> }) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(params.return_to || "/settings");
  if (await getSenderDeckUser()) redirect(returnTo);
  return <SignInScreen returnTo={returnTo} passwordError={!!params.error} />;
}
