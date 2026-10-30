import type {Metadata} from "next";
import WorkspaceNav from "../WorkspaceNav";
import {requireSenderDeckUser} from "../senderdeck-auth";
import Publishing from "./Publishing";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Publishing | SenderDeck",description:"Routine organic feed and Story delivery with separate receipts."};
export default async function PublishingPage(){const user=await requireSenderDeckUser("/publishing");return <main className="social-page"><WorkspaceNav email={user.email} source={user.authSource} active="publishing"/><header className="workspace-heading"><div><p className="workspace-kicker">ORGANIC SOCIAL CONTENT</p><h1>Publishing</h1><p>One daily topic for your selected brand. Separate results for every feed and Story.</p></div></header><Publishing/></main>;}
