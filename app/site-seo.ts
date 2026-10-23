import type { Metadata } from "next";

export const SITE_ORIGIN = "https://senderdeck.devectus.com.au";

// Only public product/documentation pages opt into search indexing.
export function publicPageMetadata(path: string): Metadata {
  return {
    alternates: { canonical: new URL(path, SITE_ORIGIN).href },
    robots: { index: true, follow: true },
  };
}
