# Issue tracker: Linear

Issues and specs for this repo live in **Linear**, team **NeonRook**, identifier prefix `NEO-`. The repo is hosted on GitHub, but GitHub Issues is not the queue: do not run `gh issue create` or read `gh issue list` looking for work. Commits reference tickets by their Linear key, as in `feat(billing): derive the monitor ceiling from capacity blocks (NEO-33)`.

There is no Linear CLI. Every operation goes through the Linear MCP tools, prefixed `mcp__plugin_linear_linear__`.

## Conventions

- **Create an issue**: `save_issue` with `team: "NeonRook"` and a `title`. Omit `id` when creating. `description` is Markdown; pass literal newlines, not `\n` escapes.
- **Read an issue**: `get_issue` with the identifier (`NEO-33`). Pass `includeRelations: true` when blockers matter. Comments come from `list_comments`.
- **List issues**: `list_issues` with `team: "NeonRook"`, filtered by `state`, `label`, `project`, or `assignee`. Pass `fields` to keep responses small; `id` is always returned.
- **Comment**: `save_comment`.
- **Close**: `save_issue` with `state: "Done"`, or `state: "Canceled"` when the work will not happen.
- **Mark a duplicate**: `save_issue` with `duplicateOf`, which also moves the issue to the `Duplicate` state.

### Labels replace, they do not append

`save_issue`'s `labels` parameter **overwrites the full label set**. Passing `labels: ["needs-info"]` removes `Bug` and every other label already on the issue. Always `get_issue` first, then send the existing labels plus the new one. This differs from `gh issue edit --add-label`, which is additive; skill instructions written for GitHub will be wrong here.

## Workflow states

`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`. New work lands in `Backlog`. `Canceled` is the terminal state for work that will not be done, which is why `wontfix` has no label. See `triage-labels.md`.

## Structure above the issue

Work is organised into **projects** grouped under **initiatives** (`Road to 1.0`, `Post-1.0`), with **milestones** inside projects. Read them with `list_initiatives`, `list_projects`, and `list_milestones`; write with `save_project` and `save_milestone`. Attach an issue to a project or milestone via `save_issue`'s `project` and `milestone` parameters.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo should treat external GitHub PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, list candidates with `gh pr list --state open --json number,title,body,author,authorAssociation` and keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`. Mirror each one into Linear rather than triaging it in place, and link back with `save_issue`'s `links`.

## Before writing a ticket or a spec

Read `PRODUCT.md`'s "Explicitly undecided" and "Absences that must not be fabricated" sections first. A ticket that resolves an open product decision, or a spec that assumes proof this project does not have, is wrong before it is written. See `domain.md`.

## When a skill says "publish to the issue tracker"

Create a Linear issue on team `NeonRook`.

## When a skill says "fetch the relevant ticket"

`get_issue` with the `NEO-` identifier, plus `list_comments` for the discussion.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a parent issue; tickets are its sub-issues.

- **Map**: an issue holding the Notes / Decisions-so-far / Fog body. Label it `wayfinder:map`.
- **Child ticket**: `save_issue` with `parentId` set to the map's identifier. Label it `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`). Once claimed, set `assignee`.
- **Blocking**: Linear has native relations. `save_issue` with `blockedBy: ["NEO-41"]` adds an edge; both `blockedBy` and `blocks` are append-only, and `removeBlockedBy` / `removeBlocks` undo them. Read them with `get_issue` and `includeRelations: true`. A ticket is unblocked when every blocker reached `Done` or `Canceled`.
- **Frontier query**: `list_issues` with `parentId: "<map>"` and `fields` including `status` and `assignee`. Drop anything with an unfinished blocker or an assignee; first in map order wins.
- **Claim**: `save_issue` with `assignee: "me"`, the session's first write.
- **Resolve**: `save_comment` with the answer, `save_issue` with `state: "Done"`, then append a context pointer to the map's Decisions-so-far.
