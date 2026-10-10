# Funding platforms for Free the Tools, 2026-10-10

## Summary

Recommendation: GitHub Sponsors (organisation account) as primary, Ko-fi as secondary. Both are free to open, and both work as plain links. No paid service is proposed. GitHub's docs say an organisation in a supported region can be sponsored, and Norway is listed. Ko-fi takes 0% on one-off tips. Contradictions and gaps: (1) Ko-fi charges 5% on memberships on the free plan, so a "monthly" Ko-fi tier is not fee-free. (2) Ko-fi's own pages returned 403, so its figures come from third-party reviews. (3) Corporate sponsors paying GitHub by card lose up to 6%. Invoiced billing cuts that to 3%. (4) A NOK payout is not confirmed in GitHub's docs. GitHub says payouts go "in local currencies" through Stripe Connect.

## Comparison

| Platform | Fee | Payout to Norway | One-off / monthly | Link-only works | Source (seen 2026-10-10) |
|---|---|---|---|---|---|
| GitHub Sponsors | 0% from personal sponsors. Up to 6% from organisations (3% card, 3% GitHub); 3% if invoiced | Yes, Norway listed. Bank account or fiscal host. Stripe Connect. NOK not confirmed | Both | Yes, a github.com/sponsors URL; FUNDING.yml key `github` | https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors ; https://docs.github.com/en/sponsors/receiving-sponsorships-through-github-sponsors/about-github-sponsors-for-open-source-contributors |
| Ko-fi (free plan) | 0% on tips; 5% on memberships and shop; PayPal or Stripe fees on top (about 2.9% + 0.30 USD) | Creator connects own PayPal or Stripe. Norwegian payout not confirmed on a Ko-fi page | Both | Yes, ko-fi.com/name page; key `ko_fi` | https://schoolmaker.com/blog/ko-fi-pricing (third party; ko-fi.com pages gave 403) |
| Buy Me a Coffee | 5% + Stripe 2.9% + 0.30 USD + 0.5% payout | Not confirmed | Both | Key `buy_me_a_coffee` | https://schoolmaker.com/blog/buy-me-a-coffee-pricing (third party) |
| Patreon | Not checked | Not checked | Monthly focus | Key `patreon` | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository (key only) |
| Liberapay | 0% platform; Stripe or PayPal costs | Not confirmed; non-profit, EU-based | Recurring focus | Key `liberapay` | https://opensource.com/article/18/5/open-patronage-liberapay (third party) |
| Open Collective (Open Source Collective) | About 10% (5% host + 5% platform) | Host receives funds; no AS entity needed | Both | Key `open_collective` | https://opencollective.com/opensource/apply/intro (search snippet only) |
| Polar.sh | 4% + 0.40 USD, now reported as 5% + 0.50 USD; merchant of record | Not confirmed | Both | Key `polar` | https://docs.polar.sh/documentation/polar-as-merchant-of-record/fees |

## Tax in Norway (accountant to confirm)

- Income: an AS is taxed on all income. Skatteetaten says an AS has its own tax liability and return (https://www.skatteetaten.no/bedrift-og-organisasjon/skatt/skattemelding-naringsdrivende/fradrag/inntekt-formue-gjeld/inntekt-as/, seen 2026-10-10). I found no source for a gift exemption for an AS. Assume donations are taxable income. Accountant to confirm.
- VAT on a pure gift: Skatteetaten says VAT applies only to supplies against consideration. A sponsorship with no return benefit is a gift, outside VAT. Accountant to confirm.
- VAT on a credit: a named credit is a return benefit. Skatteetaten says concrete return benefits make a sponsorship VAT-able (https://www.skatteetaten.no/en/rettskilder/type/uttalelser/prinsipputtalelser/skatte--og-avgiftsmessige-forhold-ved-sponsing-av-veldedige-organisasjoner---sosiosponsing/, seen 2026-10-10). Invoice it with 25% VAT. Accountant to confirm.

## Free and open sweep

Every option above is free to open. No paid service is proposed. Not searched: local drives or archives (not relevant to this question).

## Found but excluded

- Buy Me a Coffee: excluded because it costs more than Ko-fi on tips (5%).
- Patreon: excluded because it is aimed at creator memberships; fee not checked.
- Liberapay: excluded for now because Norway payout is unverified; a fair third option.
- Open Collective / Open Source Collective: excluded because the 10% fee buys a fiscal host we do not need.
- Polar.sh: excluded because it is a merchant of record for products, with a 4-5% fee.
- Tidelift, IssueHunt, thanks.dev, LFX: seen as FUNDING.yml keys; not researched.
