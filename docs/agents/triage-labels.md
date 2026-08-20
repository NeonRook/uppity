# Triage labels

The skills speak in terms of five canonical triage roles. This file maps those roles onto what this repo's Linear workspace actually uses.

| Role in mattpocock/skills | In our tracker          | Meaning                                  |
| ------------------------- | ----------------------- | ---------------------------------------- |
| `needs-triage`            | label `needs-triage`    | Maintainer needs to evaluate this issue  |
| `needs-info`              | label `needs-info`      | Waiting on reporter for more information |
| `ready-for-agent`         | label `ready-for-agent` | Fully specified, ready for an AFK agent  |
| `ready-for-human`         | label `ready-for-human` | Requires human implementation            |
| `wontfix`                 | **state** `Canceled`    | Will not be actioned                     |

Four of the roles are Linear labels. `wontfix` is not: Linear models "we are not doing this" as the `Canceled` workflow state, so recording it as a label too would give the same fact two homes that drift apart. To apply the `wontfix` role, call `save_issue` with `state: "Canceled"` and leave labels alone.

The four labels are team-scoped to `NeonRook` and sit alongside the existing type labels `Feature`, `Bug`, and `Improvement`, which they do not replace.

**Applying a label is a read-then-write.** `save_issue`'s `labels` parameter overwrites the whole set, so fetch the issue's current labels first and send them back along with the new one. See `issue-tracker.md`.
