import type { Metadata } from "next";
import { SITE_ORIGIN } from "./site-seo";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const imageUrl = `${SITE_ORIGIN}/og.png`;
  const description =
    "Open-source email and brand conversation tools for Codex and Claude. Manage Google and Microsoft mailboxes, brand policies and approved replies, with clear social activation requirements.";

  return {
    metadataBase: new URL(SITE_ORIGIN),
    robots: { index: false, follow: true },
    verification: { other: { "msvalidate.01": "CCE998DC4B894F0201E2EB8914827675" } },
    title: "SenderDeck by DEVECTUS",
    description,
    icons: {
      icon: "/senderdeck-mark.svg",
      shortcut: "/senderdeck-mark.svg",
      apple: "/senderdeck-icon-180.png",
    },
    openGraph: {
      title: "SenderDeck by DEVECTUS",
      description,
      images: [{ url: imageUrl, width: 1732, height: 909 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "SenderDeck by DEVECTUS",
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
