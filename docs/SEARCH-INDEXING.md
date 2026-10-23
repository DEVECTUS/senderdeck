# Search indexing

The production origin is `https://senderdeck.devectus.com.au`.
Public product, installation, support and policy pages have self-referencing
canonical URLs and opt into indexing. Other application pages inherit `noindex`;
authentication remains responsible for access control.

`public/sitemap.xml` lists the seven public pages. `public/robots.txt` advertises
that sitemap and keeps crawlers out of API and OAuth endpoints. Add new public
pages to the sitemap and use `publicPageMetadata` in their page metadata.

## Google

Use the verified URL-prefix property for `https://senderdeck.devectus.com.au/`
in [Google Search Console](https://search.google.com/search-console).
Submit `sitemap.xml` under Sitemaps and inspect the homepage to request indexing.
The parent domain's verified ownership can verify the subdomain property.
Search Console reports determine indexing status; an accepted sitemap is not
proof that a page is indexed. Crawling can take days or weeks.

## Bing and IndexNow

The root-level IndexNow text file proves control of the public host. After a
deployment changes public content, submit the changed public URLs to
`https://api.indexnow.org/indexnow` with `host`, `key`, `keyLocation` and `urlList`
as described in the [IndexNow protocol](https://www.indexnow.org/documentation).
Verify the deployed key file and URLs first. HTTP 200 confirms receipt; 202
means receipt with key validation pending. Neither guarantees indexing.

Use [Bing Webmaster Tools](https://www.bing.com/webmasters) to inspect indexing
and submit the sitemap. IndexNow submissions are shared with participating
engines, including Bing; Google submission is handled separately.
