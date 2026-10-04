# Email me my results — build plan

Status: waiting for Daniel’s approval. No feature code in this change.

This plan covers an “Email me my results” opt-in on both simulator pages:

- `/learn/safety-stock-simulator/` (the teaching simulator)
- `/learn/safety-stock-simulator/own-data/` (up to 10 SKUs, paste from a spreadsheet, and a `#d=` link)

The site is a static Eleventy site on Cloudflare Pages. Both simulators run in the browser. The teaching page remembers the visit in `sessionStorage` (a temporary store for that tab only). The own-data page keeps inputs in the page address after `#d=`. That part of the address is not sent to the server when someone opens the page. Nothing in the current code sends an email.

Wording version for this design: `sim-results-v1`.

## What you are approving

If you approve this plan, later pull requests will add:

1. A short form that appears after a run, on both pages.
2. One email with the settings, the numbers, a few commentary lines, and a link that reopens the same scenario.
3. A small server-side check that blocks abuse, records consent, and sends the email through Resend.
4. DNS records so mail from `news.practicalsupplychainplanning.com` passes the usual inbox checks.

This document does not change the live site.

## Words used below

| Term | Plain meaning |
| --- | --- |
| Pages Function | A small program that runs next to the website on Cloudflare. Visitors stay on `practicalsupplychainplanning.com`. It is Cloudflare’s Worker product, attached to this site. |
| D1 | Cloudflare’s small database. We would use it for consent records and the do-not-email list. |
| Turnstile | Cloudflare’s “I am a person” check. It replaces a picture captcha. |
| Resend | The email service already used for licence emails. |
| SPF, DKIM, DMARC | Three DNS records that tell Gmail and Outlook the message really came from us. |
| Seed | The sample number that makes the same random year come back. The page already uses one. |
| `#d=` fragment | The part of an own-data link after `#`. It holds the scenario. Browsers do not send it to the server. |
| Suppression list | A do-not-email list. We check it before every send. |
| UTM | Labels on a link (`utm_source`, `utm_medium`, `utm_campaign`) so we can see which link was clicked. |

## What the person sees

The form stays hidden until a run has finished (Run year, or Run Monte Carlo). Changing a setting already clears the results. The form hides again until the next run.

After a run, both pages show the same panel:

1. An email field.
2. Two boxes, both unticked:
   - Required: “Email me the results of the scenario I ran. This is a one-off email.”
   - Optional, separate: “Also send me new articles from Practical Supply Chain Planning. Unsubscribe any time.”
3. Under the boxes: “We'll use your email only as described above.” followed by a Privacy link to `/privacy/`.
4. A Send button. It stays disabled until the required box is ticked.

If they tick the box and the address is blank or not a valid email, Send does not go out. A short message asks for an email address.

On success, the panel is replaced by this exact sentence:

> Sent. Check your inbox (and spam folder).

There is no second confirmation email. Ticking the articles box does not start a double opt-in.

The Send button is disabled while the request is in flight, so a double click does not send two emails.

### Copy that must change on the pages

Both pages currently say that nothing is stored or sent to a server. That sentence would be false once this ships. The build will replace it with:

Teaching page:

> The simulation runs in this browser. Nothing is stored on a server unless you ask to email yourself the results. That email contains a summary of the scenario you ran. We do not keep that summary.

Own-data page:

> SKU names, forecasts, stock, and prices stay in this browser and in the #d= part of the link. They are not stored on a server. If you ask to email yourself the results, the email contains a summary and a reopen link. Anyone who has that email can read the numbers. We do not keep the summary or the link.

The calculation engines stay free of network calls. The existing check that `own-data-engine.js` contains no `fetch` and no Resend reference stays in place.

## The email

From: **Daniel at Practical Supply Chain Planning** `<hello@news.practicalsupplychainplanning.com>`

Reply-to: `support@practicalsupplychainplanning.com` (so a reply lands in the inbox you already watch).

Subject, exact:

> Your Safety Stock Simulator results: the scenario you ran

Open and click tracking stay off. There is no tracking pixel.

The message has a designed version and a plain-text version with the same words, for mail apps that do not show layout.

### Sections, in order

1. **What you ran.** Mode (One year, or Monte Carlo — fifty years) and the seed.
2. **Settings used.** See the lists below.
3. **Key numbers.**
4. **Commentary.** The rule lines below.
5. **Chart.** One year only. Monte Carlo has no chart, matching the page (“Summary only, no chart”).
6. **Reopen this scenario.** One link.
7. **One soft line.** “Planning stock in a spreadsheet? Practical Stock Planner plans by weeks of cover.” The words “Practical Stock Planner” are the link. Destination: `https://practicalsupplychainplanning.com/products/practical-stock-planner/` plus the same `utm_` labels as the reopen link. `/buy/` and `/pricing/` 301 straight there.
8. **Disclaimer, exact meaning:** “These numbers come from a teaching simulation of the scenario you ran. They are not a forecast, a recommendation or advice for your business.”
9. **Footer.** See below.

The email never says “your business should” or “recommended”. Practical Stock Planner is described only as planning by weeks of cover. The email does not say that Practical Stock Planner calculates safety stock. It does not.

A last check on the server rejects the send if the finished text contains the phrase “your business should” or the word “recommended”. The disclaimer keeps “a recommendation”, because that word is part of the required sentence.

### Settings in the teaching email

- Demand pattern: Level, Seasonal, or Rising
- Lot size: fixed quantity, or weeks of cover (2, 4, 6, or 10)
- Safety stock: fixed quantity, weeks of cover, or the formula (and the service level, when the formula is on)
- Lead time: 2, 5, or 10 weeks
- Demand variability, lead-time variability, and delivery variability: off, small, medium, or large
- Demand shock: on or off

Teaching prices stay the fixed ones already on the page: $100 sell, $70 cost, $30 gross profit per unit. The teaching page’s annual gross profit multiplies all simulated demand by $30, including units the year could not fill. The email will say that in one line under the gross-profit figure, so the number is not read as profit on units sold. The own-data page already counts only units sold. Its email will say that instead.

### Settings in the own-data email

Shared settings: delivery variability, demand shock, mode, and seed.

Then one block per SKU (up to 10): the SKU name, weekly forecast, current stock, unit cost, selling price, lead time, lot size, safety stock setting, and the two variability settings that belong to that SKU.

### Key numbers

For One year, one figure each:

- Out-of-stock weeks
- Customer service level
- Inventory turns
- Average working capital
- Annual gross profit
- Safety stock

For Monte Carlo, the same figures as the median and the P10–P90 band, written the way the page already writes them: “Median X (P10 Y–P90 Z)”. Annual gross profit on the teaching page is a median only (the page does not calculate a P10–P90 for it). The email will match the page. Where some Monte Carlo years have no stock on hand, the turns line keeps the page’s note that those years are left out of the turns band only.

Own-data adds a table: one row per SKU with those numbers, then a total row for working capital and gross profit only. Out-of-stock weeks, service, and turns are not added across SKUs. That matches the table already on the page.

### Commentary rules

The own-data engine already picks up to three lines. The teaching page has the same cutoffs for its on-screen callout, and does not yet have these lines. The email will use the same rules and the same sentences on both pages. The browser chooses the lines. The server does not run the simulation again.

Cutoffs already in the code: turns of 8 or more, service below 95%, and 3 or more out-of-stock weeks.

Each line starts with “In the scenario you ran”. The first matching lines are kept, up to three. The rules are checked in this order:

1. High turns with weak service: “In the scenario you ran, high turns came with weak service: the stock looks busy because it is often missing.”
2. No stockouts, and safety stock is above zero: “In the scenario you ran, there were no stockouts. Try a lower safety stock to see where service starts to drop.”
3. Lead-time variability or delivery variability is on, and there was a stockout: “In the scenario you ran, late or short deliveries showed up as stockouts even with safety stock in place.” If safety stock is zero, the line ends at “stockouts.”
4. The demand shock is on and a stockout falls on or after the first shock week: “In the scenario you ran, the doubled-demand weeks used up the buffer. Shocks are hard to plan for.”
5. Safety stock uses the formula, and lead-time variability, short deliveries, or the shock is on: “In the scenario you ran, safety stock used the textbook formula. That formula assumes a fixed lead time and random demand only, so it does not cover …” and then only the items that are actually on.
6. Lot size is 6 or 10 weeks of cover and turns are under 6: “In the scenario you ran, big lots raise average stock and working capital, which lowers turns.”
7. Average working capital is negative: “In the scenario you ran, negative average stock means backorders outweighed stock on hand.”
8. Monte Carlo only, and the out-of-stock P90 is at least 4 weeks above the P10: “In the scenario you ran, the results vary a lot from year to year under the same settings.”
9. Fallback, always last: “In the scenario you ran, change one setting at a time to see what drives service and cash.”

On own-data, lines are gathered across the SKUs, duplicates are dropped, and the email still keeps at most three lines for the whole message.

A quiet scenario can produce only the fallback line. The plan does not add a filler sentence to force a second line.

### Chart

Dev choice: a PNG picture, attached inside the email.

The browser already draws the chart (ending stock and safety stock, weeks 1, 13, 26, 39, and 52). It takes a snapshot of that drawing and sends the picture with the summary. The server attaches it and then drops it. The picture is not written to the database, and it is not written to our logs.

PNG is the format Gmail, Outlook, and iPhone Mail all display. Those apps often drop an SVG drawing, so the email will not use SVG.

One year, teaching page: one picture.

One year, own-data: one picture per SKU, up to 10, with the SKU name as a heading above the picture.

Monte Carlo: no picture.

If the pictures together are larger than 400 KB, the send is refused and the person is asked to try again. A normal chart snapshot is far smaller than that.

### Reopen this scenario

The link uses:

`utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1`

The email address is never put in a URL.

**Teaching page.** This page has no share link today. The build adds a query string (the `?` part of the address) that carries the settings, the mode, and the seed. The email link also includes `run=1`. Opening it fills the settings and runs that sample once, so the numbers match the email. A visit with no query string behaves as it does today.

| Parameter | Meaning |
| --- | --- |
| `m` | `year` or `mc` |
| `s` | Seed |
| `p` | `level`, `seasonal`, or `rising` |
| `lm` | Lot mode: `fixed` or `weeks` |
| `lq` | Fixed lot quantity |
| `lw` | Weeks of cover for the lot |
| `sm` | Safety stock mode: `fixed`, `formula`, or `weeks` |
| `sq` | Fixed safety stock |
| `sw` | Weeks of cover for safety stock |
| `sl` | Service level (90, 95, 98, or 99) |
| `lt` | Lead time (2, 5, or 10) |
| `dv`, `lv`, `qv` | Demand, lead-time, and delivery variability |
| `sh` | Shock: `1` or `0` |
| `run` | `1` means run once on open |

Example shape:

`https://practicalsupplychainplanning.com/learn/safety-stock-simulator/?m=year&s=20260923&p=level&lm=fixed&lq=40&lw=4&sm=fixed&sq=20&sw=4&sl=95&lt=5&dv=off&lv=off&qv=off&sh=0&run=1&utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1`

**Own-data page.** The scenario stays in the existing `#d=` fragment (version 1, already live, including the seed after a run). Mode is not inside that fragment today. Putting it there would change every existing link. The email link keeps the fragment and adds the mode, `run=1`, and the `utm_` labels in the query string:

`https://practicalsupplychainplanning.com/learn/safety-stock-simulator/own-data/?m=year&run=1&utm_source=results-email&utm_medium=email&utm_campaign=sim-results-v1#d=...`

A copied own-data link, without `run=1`, still shows “Press Run to see this scenario.” Only the email link starts the run by itself.

The reopen link contains the own-data numbers, because the fragment does. The page already warns that anyone with the link can read them. The email repeats that in one short line next to the link.

### Footer of every email

- “Practical Supply Chain Planning (Daniel Hampton, sole trader), ABN 56 757 743 802”
- Why they received it: “You're receiving this because you asked for the results of the scenario you ran.”
- If the articles box was ticked, a second sentence: “You also asked to hear about new articles. Unsubscribe any time.”
- A visible unsubscribe link
- `support@practicalsupplychainplanning.com`

No postal address in this version. A PO Box is to be added before any sends aimed at the US, and before any Articles broadcast. A one-off results email can still reach a US inbox if that person uses the form. That follows the instruction to leave the postal address out for now.

The public website still hides the ABN. The site data file has a placeholder, and the seller line omits it until that placeholder is replaced. This project does not change the website footer. The email footer uses the ABN above.

### Headers Gmail and Yahoo expect

- `List-Unsubscribe`: a `mailto:` link to `support@practicalsupplychainplanning.com` (subject “Unsubscribe”) and an `https://` link
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

The https link uses a random id stored next to the consent record. The address itself is not in the URL. Gmail’s Unsubscribe button sends a one-click POST to that link. The visible footer link is the same destination, for a person who clicks it.

For this first version, the mailto link lands in the support inbox. The https link is the one the system handles on its own. Until mail to `support@` is wired in automatically, an unsubscribe that arrives only by email needs a manual add to the do-not-email list. That is listed in your to-dos.

## How the pieces fit

```text
Browser (both simulator pages)
  after a run, the person ticks the box and presses Send
        |
        |  POST /api/results-email
        |  summary only (see below)
        v
Pages Function on this website
  1. Ignore the send if the hidden honeypot field was filled
  2. Check the Turnstile token with Cloudflare
  3. Apply the rate limits
  4. Refuse the address if it is on the suppression list
  5. Send with Resend
  6. Write the consent record, including the Resend message id
  7. If the articles box is ticked, add the address to the Articles audience
        |
        v
Resend  -->  the person's inbox

Resend webhooks (bounce, complaint, unsubscribe)
        |
        v
Pages Function  -->  suppression table
```

The form posts to this same website. There is no call to the licensing service.

### What the POST is allowed to carry

The browser sends a summary so the email can be written. It does not send the 52-week table. The summary is:

- The email address, both box states, the page address, the UTM labels from that visit, the wording version, and the exact wording of both boxes
- The Turnstile token and an empty honeypot field
- Form id: `safety-stock-simulator` or `own-data-simulator`
- Mode, seed, the settings listed above, the key numbers, up to three commentary lines
- The reopen URL (for own-data this includes the `#d=` fragment, because the email has to contain that link)
- The chart pictures, for One year only

The server checks the shape and the size, sends the email, and discards the body. Logs must not include the body, the fragment, the chart, or the SKU fields.

### Articles audience

A Resend contact is added to an audience named **Articles** only when that box is ticked, the results email was accepted, and the address is not suppressed.

No double opt-in in v1. Adding the contact does not send a welcome email.

This work does not send articles. When article sends are built later, every send checks this same suppression list first. A broadcast started from the Resend website has to exclude suppressed addresses as well.

### Unsubscribe, bounces, and complaints

Signed Resend webhooks are the source for bounces, complaints, and unsubscribes. The signature is checked with the webhook secret (Resend uses Svix signatures). Unsigned or stale calls are rejected. A repeated delivery of the same event is ignored.

| Event | What we store |
| --- | --- |
| Hard bounce (`bounced@` style permanent failure) | Suppression, reason `bounce`. Block every future send. |
| Soft bounce (mailbox full, temporary) | Nothing on the suppression list. |
| Complaint (marked as spam) | Suppression, reason `complaint`. Block every future send. |
| Unsubscribe (one-click, the footer link, or a Resend audience unsubscribe) | Suppression, reason `unsubscribe`. Block every future send. |

The check runs before every send, including a later results request and any future article send.

If someone unsubscribes and later wants a results email, they write to `support@practicalsupplychainplanning.com`. A new tick on the form does not override the list by itself. That keeps an unsubscribe sticky.

The form’s message in that case: “This address is unsubscribed. Email support@practicalsupplychainplanning.com if you want results again.”

### Abuse controls

All three are required. Any one of them failing means no email.

1. **Turnstile**, checked on the server with Cloudflare’s siteverify endpoint. The secret key never goes in the page. A failed check asks them to refresh and try again.
2. **Honeypot.** A field that people do not see. If it contains anything, we show the success sentence and send nothing. Nothing is stored, and the attempt does not count toward the rate limit. Bots get no hint that they were ignored.
3. **Rate limits.** About 5 sends per IP address per hour, and about 3 sends per recipient per day. The limits are rolling windows, not calendar buckets. The IP is the one Cloudflare reports (`CF-Connecting-IP`). The person’s browser does not get to name its own IP. Over the limit, the message is: “That address or network has sent several of these already. Try again later.” The message does not say which limit was hit.

Attempts that fail Turnstile do not count. Sends, and attempts refused by the rate limit, do count.

## What is stored, and for how long

Two different kinds of data. The summary is not one of them.

### Consent record, one per successful send

| Field | Why |
| --- | --- |
| Email address (stored in lower case) | Who asked |
| UTC timestamp | When they asked |
| IP address | The spec asks for it, and it supports the rate limit |
| Form id | Which page |
| Page URL | Path and query only. The `#d=` fragment is removed. Any email-like query value is removed. |
| Wording version | `sim-results-v1` |
| Wording text | The exact text of both boxes |
| UTM labels | From the visit that submitted the form, not from the links inside our email |
| Results box | Will be yes. The button cannot send otherwise. |
| Articles box | Yes or no |
| Resend message id | Ties the row to the email that went out |
| Unsubscribe token | Random id for the footer link. Not the email address. |

**Kept for 24 months, then deleted.** That is long enough to show what someone agreed to. Say if you want a different period.

### Suppression table

Email, reason (bounce, complaint, or unsubscribe), UTC time, and the Resend event id.

**Kept until you clear that address on purpose.** Deleting it automatically would let us email a bounced or complaining address again.

### Rate-limit rows

Normalised email, IP, and UTC time.

**Deleted after 48 hours.** These are not consent records.

### Not stored

SKU names, forecasts, stock, prices, the 52-week table, the chart, the commentary, the result numbers, and the `#d=` link. They exist in the email for the time Resend keeps sent mail. On Resend’s free plan that published retention is 30 days. We do not keep our own copy.

The website’s current Privacy page is a placeholder. It says the policy is not published yet. The form’s Privacy link will point at it, so the placeholder needs a real paragraph before this ships. A draft is in your to-dos. It is for you to approve. It is not legal advice.

## DNS records

Approved direction: add Resend’s SPF and DKIM records for `news.practicalsupplychainplanning.com` only.

Leave these existing records as they are:

- The root MX records (they deliver normal mail)
- The existing `send` record
- The existing `resend._domainkey` record

Do not turn on Resend “receiving” for this domain in v1. Receiving adds another MX record and is a later choice.

### Who does what

1. You add the domain `news.practicalsupplychainplanning.com` in the Resend dashboard and choose the region. Copy the records from that domain’s Records tab. The DKIM value is unique and does not exist until you do this.
2. Add those records by hand in Cloudflare DNS. Do not use Resend’s “Sign in to Cloudflare” button. That automatic setup can touch records we have to leave alone.
3. You click Verify DNS Records in Resend.

The developer can add the Cloudflare records if you paste the Records tab into the task. You still have to create the domain in Resend, because the DKIM value is created there.

### Records to add, if Resend shows the classic set

Cloudflare’s zone is `practicalsupplychainplanning.com`. Type the Name column exactly. Proxy stays off (DNS only, grey cloud). TTL Auto.

| Type | Name | Content | Priority |
| --- | --- | --- | --- |
| MX | `send.news` | `feedback-smtp.<region>.amazonses.com` | 10 |
| TXT | `send.news` | `v=spf1 include:amazonses.com ~all` | |
| TXT | `resend._domainkey.news` | `p=` followed by the value Resend shows | |

The region in the MX host is one of `us-east-1`, `eu-west-1`, `ap-northeast-1`, or `sa-east-1`. It must match the region you picked in Resend. Copy it. Do not invent it.

These names are not the root `send` host and not the root `resend._domainkey` host. Adding `send.news` does not change inbox delivery for the root domain.

### If Resend shows CNAME records instead

Domains created after August 2026 can be given CNAME records rather than the MX and TXT pair. If the Records tab shows CNAMEs, add those, DNS only, and do not also add the classic trio. The Records tab wins over the table above.

### Optional DMARC on the subdomain

The organisational DMARC policy `p=quarantine` already covers subdomains that do not have their own record. A separate record is optional.

If you want reports for this subdomain only, add:

| Type | Name | Content |
| --- | --- | --- |
| TXT | `_dmarc.news` | `v=DMARC1; p=quarantine; rua=mailto:ADDRESS` |

Use a mailbox you actually read. If you do not want a new mailbox, skip this record and keep relying on the organisational policy.

### What “pass” looks like

After a test message, Gmail’s “Show original” should show `spf=pass`, `dkim=pass`, and `dmarc=pass`, with DKIM aligned to `news.practicalsupplychainplanning.com`.

## Backend choice

Two places could send the email and store the consent record.

### Option A — Cloudflare Pages Function, D1, and Turnstile

This is a Worker attached to the website you already host.

**Pros**

- Marketing consent and the do-not-email list stay away from licence keys and Paddle payments.
- The form and the sender share one address. No extra public door into the licensing service.
- Turnstile is a Cloudflare check, verified in the same place.
- At the volume of a teaching simulator, the extra Cloudflare bill is $0. Details are in the cost section.
- An unsubscribe here cannot, by accident, block a licence-key email. The two lists are different.

**Cons**

- A new D1 database, and a handful of secret values to paste into Cloudflare.
- You still create the Resend domain, the audience, the API key, and the Turnstile widget. That dashboard work exists either way.

### Option B — the existing Railway licensing service

The live service is `pscp_licensing`. It already sends mail with Resend. It stores its data in a SQLite file on a Railway disk (`DATABASE_PATH` on a volume). The brief described Postgres. The running service is SQLite, not a separate Postgres database.

**Pros**

- Resend is already connected there.
- There is already a database file, so no new database product.
- Extra traffic on that existing service would add little to the Railway bill.

**Cons**

- The public form would be a new entrance to the service that also handles licence keys, the admin key, and Paddle webhooks.
- SQLite on one file locks while it writes. A burst of form posts sits on the same file as licence emails.
- A shared do-not-email list could suppress a licence email because someone unsubscribed from articles. Keeping two lists inside one licensing database is easy to get wrong later.
- Turnstile would still be Cloudflare. Railway does not remove that.
- Marketing and licensing would ship in the same codebase and the same deploy.

### Recommendation

Use Option A. Keep this mailing list off the licensing service.

Option B is not clearly worse on cost. It is worse on separation. A bug, a bad deploy, or a shared suppression list would sit next to licence delivery. The simulator volume is too small to justify that.

Use a new Resend API key that can send, and nothing else. Leave the licensing key where it is.

## Monthly cost

Prices below are the published figures checked on 1 October 2026. This assumes a teaching-tool volume: under 100 result emails a day and under 3,000 a month.

| Piece | Expected monthly cost | Notes |
| --- | --- | --- |
| Cloudflare Pages Function and D1 | $0 | Free allowance includes 100,000 Worker requests a day, 100,000 D1 writes a day, and 5 GB stored. This feature is a tiny fraction of that. Turnstile’s free plan includes unlimited checks. |
| Cloudflare Workers Paid | $0 extra, unless the account is already on it | The paid plan is $5 per month and includes a much larger allowance. Do not upgrade for this feature. |
| Resend | $0 on the free plan | 3,000 emails a month, capped at 100 a day, and 3 verified domains. Marketing contacts on the free plan cover an Articles audience of up to 1,000. |
| Resend Pro, only if you need it | $20 | 50,000 emails a month, no daily cap, 10 domains. You need this if the account already uses all 3 free domain slots, or if sends pass 100 in a day. |
| Railway | $0 extra under this recommendation | We do not add a service. The licensing service keeps its current bill. |
| DNS | $0 | Records on the zone you already have. |

**Planning number: $0 per month**, plus $20 only if the Resend account has no spare domain slot or the free daily cap becomes a problem.

Resend test sends count toward that quota. Budget a few dozen tests.

## Build steps

Each step is its own small pull request, after you approve this plan. None of them is this document.

### PR 1 — Reopen links, no email yet

- Teaching page reads the query parameters above and can run once when `run=1` is present.
- Own-data page reads `m` and `run` from the query string. The `#d=` format stays version 1.
- Existing copied links still wait for Run.
- Automated checks cover a round trip: settings in, link out, same settings and the same seed back.
- No form, no network call.

### PR 2 — Send path, still hidden from the pages

- D1 tables for consent, suppression, and rate limits.
- `POST /api/results-email` with Turnstile, honeypot, rate limits, suppression check, Resend send, consent row, and the Articles contact.
- Signed webhook endpoint.
- Unsubscribe page and one-click POST.
- A feature switch, off by default, so nothing on the public pages calls it until you have pasted the keys and verified the domain.
- Developer tests with scripted requests, plus Resend’s test inboxes (`delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`).

### PR 3 — The panel on both pages

- The form, the disabled Send button, the success sentence, and the chart snapshots.
- The analytics page described below.
- The copy change that tells the truth about what is sent.
- The switch stays off in production until you say the keys, DNS, and privacy paragraph are in place.

### Analytics

Cloudflare Web Analytics counts page views. It has no button for a custom event. The email address must not appear in a URL.

After a successful send, the page loads a hidden frame of:

`/learn/safety-stock-simulator/sent/`

That page is real, hidden from search (`noindex`), and left out of the sitemap. Someone who opens it directly sees: “Check your inbox (and spam folder).” There is no query string.

The repo does not contain the Web Analytics snippet today. Cloudflare may be injecting it. The build will view the source of the live simulator page first.

- If the beacon is already injected, the hidden frame is enough. Do not add a second snippet.
- If it is not, add the snippet on the `/sent/` page only, using the site token from the Web Analytics dashboard. That counts this path without adding a new tracker to every other page.

## QA test plan

QA runs this after PR 3 is on a preview, with the real DNS verified. Developer checks before that are the scripted tests in PR 1 and PR 2.

### Rendering

Send one One-year teaching email and one own-data email (two SKUs) to:

- Gmail on the web
- Outlook on the web (and the desktop app if you have it)
- Mail on an iPhone

On each, confirm:

- The subject and the from-name match this plan
- The numbers match the run on screen
- Monte Carlo shows median and P10–P90, and has no chart
- One year shows the chart, and the chart matches the page
- The disclaimer and the footer are present, including the ABN and the support address
- There is no postal address
- The words “your business should” and “recommended” do not appear
- The Practical Stock Planner line does not say it calculates safety stock
- The plain-text version is readable

### Links

- The reopen link restores the same mode, seed, and settings, and runs once
- The own-data reopen link keeps the SKU names and numbers
- Both links include `utm_source=results-email`, `utm_medium=email`, and `utm_campaign=sim-results-v1`
- Neither link contains the email address
- The Practical Stock Planner link goes where you confirmed

### Form

- Send stays disabled until the required box is ticked
- Both boxes start unticked
- The panel is absent before a run and after a setting change
- Success shows the exact sentence
- The articles box off: no new Articles contact
- The articles box on: one Articles contact, and no second email
- Honeypot filled: the person sees the success sentence, and no email arrives
- Sixth send from the same IP inside an hour is refused
- Fourth send to the same address inside a day is refused

### Unsubscribe

- The footer link shows a clear “you are unsubscribed” page and does not show the email address in the address bar
- A later send to that address is refused
- Gmail’s Unsubscribe control (one-click) does the same
- A `mailto:` unsubscribe to support is a manual step until that inbox is automated

### Bounce and complaint

Using Resend’s test addresses, which count toward the monthly quota:

- `bounced@resend.dev` writes a bounce row, and a later send to that address is refused
- `complained@resend.dev` writes a complaint row, and a later send is refused
- An unsigned webhook is rejected and writes nothing

### SPF, DKIM, and DMARC

On the Gmail message, open Show original. Pass requires:

- `spf=pass`
- `dkim=pass` for `news.practicalsupplychainplanning.com`
- `dmarc=pass`

Repeat the header check on Outlook. iPhone Mail does not show these headers; the Gmail check covers authentication.

### Analytics

After one successful send, Cloudflare Web Analytics shows a page view for `/learn/safety-stock-simulator/sent/`. The address contains no email.

## What Daniel does himself

The developer cannot do these. They need your login.

1. Approve this plan, the privacy paragraph, and the Practical Stock Planner URL.
2. In Resend, add the domain `news.practicalsupplychainplanning.com`. Pick the region. Leave open and click tracking off. Do not enable receiving.
3. Copy the Records tab. Add the records in Cloudflare by hand, or paste the tab to the developer to add. Leave the root MX, `send`, and `resend._domainkey` alone.
4. Click Verify in Resend after the records are in.
5. Decide whether to add the optional `_dmarc.news` record. If yes, choose the mailbox that receives the reports.
6. Check how many domains the Resend account already has. Three is the free-plan limit. If this domain would be a fourth, the plan is Resend Pro at $20 a month.
7. Create a new Resend API key that is allowed to send, separate from the licensing key. Paste it into the Cloudflare secret named `RESEND_API_KEY` for this site. Do not put it in git or in a chat that gets archived into the repo.
8. Create a Resend webhook pointing at `https://practicalsupplychainplanning.com/api/resend-webhook` for bounces, complaints, and unsubscribes. Paste the signing secret into `RESEND_WEBHOOK_SECRET`.
9. Create an audience named `Articles`. Paste its id into `RESEND_ARTICLES_AUDIENCE_ID`.
10. In Cloudflare Turnstile, create a widget for `practicalsupplychainplanning.com` and `www.practicalsupplychainplanning.com`. The site key can go in the page. The secret key goes into `TURNSTILE_SECRET_KEY`.
11. Replace the Privacy placeholder before the form is switched on. Approved published wording:

    > If you ask a page on this website to email you the results, we send one email to the address you typed. We keep a record of that request for 24 months: your email address, the time, the network address, which page you used, the wording you agreed to, and whether you also asked for new articles. We do not keep your SKU names, forecasts, prices, stock levels, or the result numbers. If you tick the articles box, we add your address to the Articles list. You can unsubscribe at any time. If a message bounces, or you unsubscribe, we keep the address on a do-not-email list so we do not write to you again. Questions: support@practicalsupplychainplanning.com.

12. After launch, watch `support@` for subjects that say Unsubscribe, and add those addresses to the suppression list until that step is automated.
13. Do not send an Articles broadcast, and do not aim a campaign at the US, until the footer has a PO Box.
14. Send yourself the QA emails on Gmail, Outlook, and an iPhone once the preview is up.

Secrets the developer will name, and you will paste:

| Secret | Where it comes from |
| --- | --- |
| `RESEND_API_KEY` | Resend → API keys |
| `RESEND_WEBHOOK_SECRET` | Resend → the webhook’s signing secret |
| `RESEND_ARTICLES_AUDIENCE_ID` | Resend → Audiences → Articles |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile → the widget secret |
| `UNSUBSCRIBE_SIGNING_KEY` | A long random string the developer generates. You do not need to invent the text. You do need to let it be stored as a Cloudflare secret. |

The Turnstile site key is public and is the one exception that belongs in the page.

## Out of scope

- Sending articles, or a double opt-in
- A postal address or PO Box
- Changing the root mail records
- Putting this data in the licensing service
- Storing SKU data
- Showing the ABN on the public website footer
- Naming any employer in the email, the form, or the page

## Source of the behaviour described above

Checked against the code on `main` at the time of this plan:

- Teaching page: `src/learn/safety-stock-simulator.njk`, `assets/safety-stock-simulator.js`, `assets/safety-stock-engine.js`. Visit state is `sessionStorage` under `pscp.learn.safetyStockSimulator.v2`. There is no query-string share link yet.
- Own-data page: `src/learn/own-data-simulator.njk`, `assets/own-data-simulator.js`, `assets/own-data-engine.js`. The fragment is `#d=` plus a version-1 payload. The seed is written into it after a run. Mode is not in the payload. Opening a link shows “Press Run to see this scenario.”
- Commentary sentences and cutoffs live in `own-data-engine.js`. The teaching engine has the same cutoffs for its callout only.
- Pages Functions today are only the www and homepage redirect in `functions/_middleware.js`.
- `/privacy/` is a placeholder. `support@practicalsupplychainplanning.com` is already the contact address.
- The licensing Railway service has Resend and a SQLite file on a disk volume. It is not the recommended home for this form.
