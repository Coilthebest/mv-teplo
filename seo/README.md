# Public search pages

Product content lives in `seo/catalog.cjs`. The generated pages in `podarki/`
are static HTML: their text, prices and JSON-LD are available without JavaScript.
Prices and formats are read from the existing `cart-pricing.js` module.

After changing prices, formats or product copy, check descriptions for any price
or size mentioned in the text, then run from the repository root:

```sh
node scripts/build-seo.cjs
```

Commit the generated product pages, `sitemap.xml` and `robots.txt` with the source
change. GitHub Pages publishes the checked-in HTML; it does not run this script.

The sitemap contains only the home page and the eight public product pages.
Order, payment, email confirmation, pickup and moderation pages remain `noindex`.
Do not add customer URLs or capability tokens to the sitemap or page metadata.

Home-page verification meta tags belong to the owner's existing Google Search
Console and Yandex Webmaster accounts. Keep them after verification. They are
public site-verification records, not application or API credentials.
