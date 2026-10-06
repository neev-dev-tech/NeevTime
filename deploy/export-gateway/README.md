# Export gateway

Public edge for the HRMS export API. Two containers, added to the existing
compose stack:

    export_gateway   nginx, serves ONLY /api/export/*, no host port published
    cloudflared      dials out to Cloudflare, routes a public hostname to it

Nothing inbound is opened on the firewall or the router. cloudflared makes an
outbound connection and Cloudflare routes traffic back down it.

## The rule that keeps this safe

`export_gateway` must never publish a host port. It is reachable only from the
compose network, which means only from cloudflared, which is what makes the
CF-Connecting-IP header trustworthy — and that header is what the API's address
allowlist reads. See the comment at the top of nginx.conf.

## Two kinds of tunnel

**Quick tunnel** — no domain, no Cloudflare account, no cost. Cloudflare hands
out a random `https://<words>.trycloudflare.com` URL. The URL changes every
time cloudflared restarts, and Cloudflare offers no availability guarantee, so
this is for proving the integration works, not for running it.

**Named tunnel** — requires a domain on a Cloudflare account (the free plan is
enough). Gives a stable hostname such as `attendance-api.example.com`, survives
restarts, and lets greytHR's addresses be allowlisted at Cloudflare's edge
before traffic ever reaches the building.

Start on a quick tunnel to get greytHR testing. Move to a named tunnel before
anyone depends on it.
