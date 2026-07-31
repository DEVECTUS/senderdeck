import type { Metadata } from "next";
import { headers } from "next/headers";
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
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const safeHost = host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)
    ? host
    : "multi-account-email-devectus.barsham.chatgpt.site";
  const imageUrl = `https://${safeHost}/og.png`;
  const description =
    "One secure workspace to connect and manage multiple Gmail, Google Workspace, Outlook, and Microsoft 365 email identities.";

  return {
    title: "Multi-Account Email",
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Multi-Account Email",
      description,
      images: [{ url: imageUrl, width: 1732, height: 909 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Multi-Account Email",
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
