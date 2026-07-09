# Vendored: Matt Pocock's Agent Skills

The skill folders in this directory (each containing a `SKILL.md`) are vendored from
[mattpocock/skills](https://github.com/mattpocock/skills) ("Skills for Real Engineers"),
so that Cursor (IDE and Cloud Agents) automatically discovers and can invoke them for
this repo. Cursor recursively scans `.cursor/skills/` for `<skill-name>/SKILL.md`
folders; each one becomes an invocable `/skill-name` command and may also be
auto-invoked by the agent when relevant (unless its frontmatter sets
`disable-model-invocation: true`).

- **Source:** https://github.com/mattpocock/skills
- **Vendored at commit:** `d574778f94cf620fcc8ce741584093bc650a61d3` (v1.1.0, 2026-07-08)
- **License:** MIT (Copyright (c) 2026 Matt Pocock) — see [`LICENSE`](./LICENSE)
- **Selection:** all 21 skills in the upstream repo's *promoted* buckets (`skills/engineering/` and `skills/productivity/`, per its `.claude-plugin/plugin.json`). Upstream's `misc/`, `personal/`, `in-progress/`, and `deprecated/` buckets were intentionally excluded, matching how the upstream repo itself scopes what it promotes.

## Recommended first step

Per the upstream README, run **`/setup-matt-pocock-skills`** once in this repo before using the other engineering skills (`/triage`, `/to-spec`, `/to-tickets`, `/implement`, `/improve-codebase-architecture`, `/wayfinder`, `/diagnosing-bugs`). It configures:

- Which issue tracker to use (this repo already uses GitHub issues/PRs — see `docs/PRD.md`'s "Publishing" notes — so GitHub is the natural answer)
- Which labels mark triaged tickets
- Where generated docs get saved (this repo already keeps specs/PRDs under `docs/`)

Skills that don't depend on that setup (`/grill-me`, `/grill-with-docs`, `/prototype`, `/handoff`, `/teach`, `/research`, `/ask-matt`, `/writing-great-skills`, `/domain-modeling`, `/codebase-design`, `/code-review`, `/tdd`) can be used right away.

## Installed skills

| Skill | Type | What it does |
|---|---|---|
| `ask-matt` | user-invoked | Router over the user-invoked skills — ask which one fits your situation |
| `grill-with-docs` | user-invoked | Alignment interview that builds/updates `CONTEXT.md` and ADRs |
| `triage` | user-invoked | Move issues through a state-machine of triage roles |
| `improve-codebase-architecture` | user-invoked | Scan for deepening opportunities, produce an HTML report, grill through the one you pick |
| `setup-matt-pocock-skills` | user-invoked | One-time per-repo config for the engineering skills — **run this first** |
| `to-spec` | user-invoked | Synthesize the current conversation into a spec, publish to the issue tracker |
| `to-tickets` | user-invoked | Break a plan/spec/conversation into tracer-bullet tickets with blocking edges |
| `implement` | user-invoked | Build a spec/ticket, driving `/tdd` at agreed seams, closing with `/code-review` |
| `wayfinder` | user-invoked | Plan work too large for one session as a shared map of investigation tickets |
| `prototype` | model-invoked | Throwaway prototype (logic or UI variations) to answer a design question |
| `diagnosing-bugs` | model-invoked | Disciplined bug-diagnosis loop: reproduce → minimise → hypothesise → instrument → fix → regression-test |
| `research` | model-invoked | Investigate a question against primary sources; leave a cited Markdown file |
| `tdd` | model-invoked | Red-green-refactor loop, one vertical slice at a time |
| `domain-modeling` | model-invoked | Sharpen the project's domain model/glossary; update `CONTEXT.md` and ADRs |
| `codebase-design` | model-invoked | Vocabulary/discipline for designing deep modules |
| `code-review` | model-invoked | Two-axis diff review: coding standards + spec fidelity |
| `grill-me` | user-invoked | Relentless interview about a plan/design (no codebase needed) |
| `handoff` | user-invoked | Compact the current conversation into a handoff doc for another agent/session |
| `teach` | user-invoked | Teach the user a concept over multiple sessions in a stateful workspace |
| `writing-great-skills` | user-invoked | Reference for writing/editing skills well |
| `grilling` | model-invoked | The reusable interview loop behind `grill-me` and `grill-with-docs` |

To update these to a newer upstream version later, re-copy the `skills/engineering/*` and `skills/productivity/*` folders listed in upstream's `.claude-plugin/plugin.json` from a fresh checkout of `mattpocock/skills`, and update the pinned commit above.
