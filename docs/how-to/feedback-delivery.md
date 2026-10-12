# How to set up feedback delivery

Suggestions and problem reports reach you by email and as an issue in a private GitHub repository. You set up the repository, a token and the email destination once. Only you run these steps. See [ADR 0013](../adr/0013-feedback-without-github.md).

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

## Check email

1. In the Cloudflare dashboard, open the domain freethetools.com → Email → Email Routing.
2. Confirm that `hello@freethetools.com` is a **verified destination** and routing is on.

## Test

1. Send a suggestion at <https://freethetools.com/suggest/>.
2. Check that the email arrived and that an issue appeared in the repository, without the email address.
3. Open <https://freethetools.com/api/health>. Both counts should be 0.

## Read the logs

- Workers & Pages → freethetools → Observability → Logs. Search for `feedback:`. A line names the channel and a status, for example `feedback: github failed: GitHub answered 401` (401: the token expired or lacks access; 404: wrong repository name or no access).
- Or run `npx wrangler tail` while you test.

## When the Live check fails on feedback delivery

The daily Live check fails when `/api/health` shows a failure for today or yesterday (UTC). Read the logs above, fix the cause, and send a test. The count falls out of the report after two UTC days.
