# go.getpracticalplanning.com redirect Worker

Outreach emails link to `https://go.getpracticalplanning.com/r/<token>`. This Worker asks the Potential Customers backend where that token should land, then answers **302**. If anything is wrong, it still sends the visitor to `https://practicalsupplychainplanning.com/`. A missed click is acceptable. A broken link is not.

It is a separate Cloudflare Worker. It is not part of the Pages site. The site build does not read this folder.

The Worker only redirects to `https://practicalsupplychainplanning.com`. It does not set cookies. Responses send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

A token is accepted only when it is 43 characters from `A–Z`, `a–z`, `0–9`, `-` and `_`. That is the string Python's `secrets.token_urlsafe()` returns at the default 32-byte length. Anything else, including `/r/not-a-token`, goes to the home page and is not sent to the backend.

Before the first real send, copy one link token from Potential Customers and check that shape. If the token is a different length, or it uses any other character, stop and say so. Those links still open the home page, but the click is not recorded until this check matches the token the backend generates.

`CLICK_SECRET` is a Worker secret. It is not in this folder, and the Worker does not write it to logs or responses. Logs record an outcome only (redirect or fallback). They do not record the token or the user agent. Invocation logs are off, because those logs store the request URL, and the token is in that URL.

## What you do

Do this yourself after the pull request is merged. Do not put the secret in a file that gets committed. Commands run from this folder, so Wrangler uses `workers/go-redirect/wrangler.jsonc` and not the Pages config at the repo root.

1. Open a terminal in the website repo and go to this folder:

   ```powershell
   cd workers/go-redirect
   npm install
   ```

2. Log in to the Cloudflare account that already hosts `getpracticalplanning.com`, if this machine is not already logged in:

   ```powershell
   npx wrangler login
   ```

3. Set the secret to the **same value** as `CLICK_SECRET` on the Potential Customers service in Railway. Wrangler prompts for the value and does not print it. Type it at the prompt. Do not pass it on the command line.

   ```powershell
   npx wrangler secret put CLICK_SECRET
   ```

   That command stores the secret and deploys a version of the Worker. If it reports that the Worker does not exist yet, run step 4 once, then run this command again. Until the secret is stored, every link still goes to the home page.

4. Deploy the Worker. This publishes the script and attaches the custom domain `go.getpracticalplanning.com`. Cloudflare creates the DNS record for that hostname. Leave the mail records on `getpracticalplanning.com` as they are: MX, SPF, DKIM, and DMARC.

   ```powershell
   npx wrangler deploy
   ```

   If deploy stops because `CLICK_SECRET` is not set, finish step 3, then run deploy again.

5. In the Cloudflare dashboard, open **Workers & Pages**, then **go-redirect**, then **Domains** (or **Settings**, then **Domains & Routes**). Confirm `go.getpracticalplanning.com` is listed for this Worker.

6. Check a token that cannot be real. This must be a redirect to the home page, and it must not depend on a live click record:

   ```powershell
   curl.exe -I https://go.getpracticalplanning.com/r/not-a-token
   ```

   Expect `302`, `location: https://practicalsupplychainplanning.com/`, `cache-control: no-store`, and `referrer-policy: no-referrer`.

## Offline tests

From this folder:

```powershell
npm test
```

The tests stub the backend call. They do not contact Railway or Cloudflare.
