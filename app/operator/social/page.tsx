import type { Metadata } from "next";
import Link from "next/link";
import { requireSenderDeckUser } from "../../senderdeck-auth";
import OperatorSetup from "./OperatorSetup";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Platform setup | SenderDeck",description:"Platform administrator readiness checks for hosted Meta onboarding."};
export default async function OperatorPage(){await requireSenderDeckUser("/operator/social");return <main className="social-page"><nav><Link className="wordmark" href="/">SenderDeck</Link><Link href="/conversations">Conversations</Link></nav><OperatorSetup/></main>;}
