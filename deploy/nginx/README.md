# nginx config for tshirtbrothers.com

`tshirtbrothers.conf` is the vhost that serves this app on the droplet
(198.211.113.144). It is tracked here so changes are reviewable and
diffable — **nothing deploys it automatically**. `deploy.sh` does not
touch nginx.

## Where it actually lives

    /etc/nginx/sites-enabled/tshirtbrothers

That path is a **regular file, not a symlink**, and it is what nginx
loads. `/etc/nginx/sites-available/tshirtbrothers` is a stale divergent
copy — as of 2026-10-07 it was missing `client_max_body_size 250M` and
the `:3070` stats proxy. Editing sites-available does nothing.

## Checking for drift

    ssh root@198.211.113.144 "cat /etc/nginx/sites-enabled/tshirtbrothers" \
      | diff - deploy/nginx/tshirtbrothers.conf

If someone edited the live file directly, that diff is how you find out.
Pull the live version back into this file rather than assuming the repo
copy is authoritative.

## Applying a change

    # back up first — this file serves the whole site
    ssh root@198.211.113.144 "cp -a /etc/nginx/sites-enabled/tshirtbrothers \
      /root/nginx-tshirtbrothers.bak.\$(date +%Y%m%d-%H%M%S)"

    scp deploy/nginx/tshirtbrothers.conf \
      root@198.211.113.144:/etc/nginx/sites-enabled/tshirtbrothers

    ssh root@198.211.113.144 "nginx -t && systemctl reload nginx"

Always `nginx -t` before reloading, and prefer `reload` over `restart`:
a config error on restart takes down **every** site on the box, not just
this one (that is what caused the 2026-09-14 three-hour outage).

## Two things to know before editing

**`add_header` does not merge.** Declaring any `add_header` inside a
`location` block discards *every* `add_header` inherited from the
enclosing `server` block. That is why the six security headers are
repeated verbatim inside `location /`. If you add a header to a location,
check whether you just silently dropped HSTS and friends. (The
`\.(js|css|…)$` regex location has this problem already — assets get
only `X-Content-Type-Options`.)

**HTML must never be cached.** `location /` sends
`no-store, no-cache, must-revalidate` on purpose. Each deploy runs
`vite build`, which empties `client/dist` and emits new hashed asset
filenames; a browser holding a stale `index.html` then requests an
`/assets/index-<oldhash>.js` that no longer exists, gets a 404, and
white-screens the site until a hard reload. The hashed assets themselves
are immutable and stay cached 30 days.

**No literal external hostnames in `proxy_pass`.** A transient DNS
failure at config-load time makes nginx refuse to start, taking down
every site on the droplet. Use a `resolver` plus a variable in
`proxy_pass` so the lookup happens per request.
