# Governance

Free the Tools is a Sapience initiative. Sapience Design founded it, maintains it and holds its name. The code belongs to everyone under AGPL-3.0.

## Roles

| Role | Who | Can |
|---|---|---|
| **Contributor** | Anyone who opens an issue, pull request or review | Request, build, report, review |
| **Tool maintainer** | The author of a tool, listed in its `tool.json` | Is asked to review changes to their tool |
| **Reviewer** | Contributors invited after several good contributions | Approve pull requests; triage issues |
| **Maintainer** | Sapience Design staff, plus reviewers invited by them | Merge, release, accept tool requests, enforce the Code of Conduct |

Maintainers are listed in [`.github/CODEOWNERS`](.github/CODEOWNERS).

## Decisions

- **Everyday changes** (a new tool, a fix): one maintainer approval plus passing checks.
- **Changes to the pledge, licence, security model or site-wide design**: proposed in a GitHub Discussion or issue, open for at least 7 days, then decided by the maintainers. The decision is recorded as an [architecture decision record](docs/adr/).
- **Accepting a tool request**: a maintainer checks it can run in the browser, isn't a duplicate, and fits the pledge. Declined requests get a reason.
- Where maintainers disagree, Sapience Design has the final say.

## Becoming a reviewer

After a handful of merged contributions and helpful reviews, any maintainer can invite you. There's no quota and no application form; ask in Discussions if you're interested.

## Stepping down

Anyone can step back at any time. Maintainers who have been inactive for 12 months are thanked and moved to an emeritus list.

## The name and the pledge

The pledge (free, private, open, no tracking of people) is what makes this project worth contributing to. It can only change through the decision process above, and Sapience Design will not change it to add paid features or tracking of individuals. If Sapience Design ever stops maintaining the project, it will hand the repository and domain to a new maintainer group or a non-profit foundation rather than let it lapse.
