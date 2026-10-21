import type { Metadata } from "next";
import WorkspaceNav from "../../WorkspaceNav";
import { requireSenderDeckUser } from "../../senderdeck-auth";
import MetaWizard from "./MetaWizard";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Connect Meta accounts | SenderDeck",description:"Choose your brand, authorise Meta and verify the business accounts you select."};
export default async function MetaConnectPage(){const user=await requireSenderDeckUser("/connect/meta");return <main className="social-page"><WorkspaceNav source={user.authSource} email={user.email} active="accounts" /><MetaWizard/></main>;}
