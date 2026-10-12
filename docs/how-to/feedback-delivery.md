# How to set up feedback delivery

Suggestions and problem reports reach you by email and as an issue in a private GitHub repository. You set up the email recipient, the repository and a token once. Only you run these steps. See [ADR 0013](../adr/0013-feedback-without-github.md).

## Create the private repository

1. On GitHub, create the repository `sapience-design/freethetools-inbox`. Set it to **Private**.
2. Under Issues → Labels, create these labels: `suggestion`, `problem` and `needs triage`.
3. Under Settings, turn on notifications for the repository in your GitHub account (Watch → All activity), so each new issue also reaches you.

## Create the token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Resource owner: `sapience-design`. Set an expiry (90 days to 1 year) and write it in your calendar.
3. Repository access: **Only select repositories** → `freethetools-inbox`.
4. Repository permissions: **Issues: Read and write**. Leave every other permission at "No access".
5. Generate the token and copy it once.

## Add it to the Worker

1. In the Cloudflare dashboard, open Workers & Pages → freethetools → Settings → Variables and Secrets.
2. Add a **Secret** named `GITHUB_TOKEN` with the token as the value. Save and deploy.
3. If you named the repository differently, change `FEEDBACK_REPO` in `wrangler.jsonc` (`vars`) and merge. A dashboard variable is overwritten by the next deploy.

Never put the token in the repository, a pull request or a chat.

## Set up email

The form emails the maintainers' own inbox. Cloudflare sends to a **verified destination address** free on every plan, including when only Email Routing is set up ([pricing](https://developers.cloudflare.com/email-service/platform/pricing/)). A routing address such as `hello@freethetools.com` is not a destination address, so the form cannot send to it.

1. In the Cloudflare dashboard, open the domain freethetools.com → Email → Email Routing.
2. Under **Destination addresses**, find the inbox that `hello@freethetools.com` forwards to. Check that it shows **Verified**.
3. Open Workers & Pages → freethetools → Settings → Variables and Secrets.
4. Add a **Secret** named `FEEDBACK_TO`, with that inbox address as the value. Save and deploy.
5. Leave **Email Sending** (Email Service) off. It is the paid way to send to any address, and the form does not need it.

Without the secret, the email channel is skipped. Never put the address in `wrangler.jsonc`: the repository is public.

Cloudflare's [send-binding reference](https://developers.cloudflare.com/email-service/configuration/send-bindings/) also says the sender's domain must be onboarded to Email Service. If the logs below show `E_SENDER_NOT_VERIFIED`, that rule applies to this account, and the GitHub channel still delivers.

## Test

1. Send a suggestion at <https://freethetools.com/suggest/>.
2. Check that the email arrived and that an issue appeared in the repository, without the email address.
3. Open <https://freethetools.com/api/health>. Both counts should be 0.

## Read the logs

- Workers & Pages → freethetools → Observability → Logs. Search for `feedback:`. A line names the channel and a status, for example `feedback: github failed: GitHub answered 401` (401: the token expired or lacks access; 404: wrong repository name or no access).
- Or run `npx wrangler tail` while you test.

## When the Live check fails on feedback delivery

The daily Live check fails when `/api/health` shows a failure for today or yesterday (UTC). Read the logs above, fix the cause, and send a test. The count falls out of the report after two UTC days.
