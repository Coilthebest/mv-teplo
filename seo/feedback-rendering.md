# Initial review HTML

GitHub Pages publishes `_site/`, built by `node scripts/build-public.cjs`.
The build reads only the existing public feedback endpoint, renders the latest
five published reviews/proposals and computes the average from all published,
email-verified review ratings. Questions stay in the separate live UI.

The page then refreshes from the live endpoint, replacing the initial cards
without duplicates. If the endpoint is unavailable, initial HTML stays visible.

The Pages workflow runs on main pushes, manual dispatch, and every 15 minutes
at minutes 7/22/37/52 UTC. GitHub may delay scheduled runs. After moderation,
live JS shows current content on the next page load; initial HTML changes on
the next successful build and Pages deployment. Unchanged scheduled builds skip
deployment. Failed fetches preserve the previously deployed site.

Review content is never written to tracked source files. The public artifact is
retained for one day. It contains the same masked emails as the public API;
unexpected unmasked emails are omitted. No admin key or backend credential is
needed. Build logs include counts only. `_site/` is ignored by Git.

No aggregate rating is attached to Organization or to unrelated Product pages:
these messages review the workshop, not individual products. Self-serving
organization review markup is ineligible for Google's review-star feature.
