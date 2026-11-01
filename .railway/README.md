# Railway configuration

This project defines its Railway infrastructure in code.

```txt
.railway/railway.ts
```

Use this file to describe the Railway project you want: services, databases, buckets, custom domains, replicas, groups, and environment variables.

## Common commands

Create the configuration files:

```bash
railway config init
```

Import an existing Railway project into code:

```bash
railway config pull
```

Preview what Railway would change:

```bash
railway config plan
```

Apply the planned changes:

```bash
railway config apply
```

## Deployments

Staging builds every push to `main`. Production runs `ghcr.io/neonrook/uppity:<version>`, where the version comes from `package.json`, so it changes only when a version pull request merges. The Deploy Production job in `.github/workflows/main.yml` then applies this configuration, after the image and the `v<version>` tag exist.

To roll production back, use Rollback on the deployment in Railway. It restores the previous image and variables.

Run `railway config apply --environment production` by hand only with a release checked out: on a commit ahead of the last release it applies changes that release does not contain, and if the version bump has not published yet, the image does not exist.

Staging applies are still manual, so run `railway config apply --environment staging` after merging a change to this file.

## Notes

- `railway config plan` is safe and does not change Railway.
- `railway config apply` previews changes and asks before applying unless you pass `--yes`.
- Destructive changes in non-interactive or agent sessions require `railway config apply --confirm-destructive` after reviewing the plan.
- Services already managed by `railway.json` must be migrated before `.railway/railway.ts` can manage them.
- Use `replicas` for scaling; advanced placement can still specify region names.
- Use `group("Name", [resources])` to keep large projects organized on the Railway canvas.
- Secrets imported from Railway are rendered as `preserve()` so existing values are retained without writing secret values to source. Use `railway config pull --omit-preserved-variables` for a smaller import.
