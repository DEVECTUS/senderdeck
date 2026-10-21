import type { Metadata } from "next";
import Link from "next/link";
import { requireSenderDeckUser } from "../../senderdeck-auth";
import MetaWizard from "./MetaWizard";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Connect Meta accounts | SenderDeck",description:"Choose your brand, authorise Meta and verify the business accounts you select."};
export default async function MetaConnectPage(){await requireSenderDeckUser("/connect/meta");return <main className="social-page"><nav><Link className="wordmark" href="/">SenderDeck</Link><div className="nav-user"><Link href="/conversations">Conversations</Link><Link href="/settings">Email accounts</Link></div></nav><MetaWizard/></main>;}
