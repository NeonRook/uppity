# Pricing cost model

This is planning material, not a price list or an offer. Uppity's paid plans are not on sale. The planned plan figures live in `PRODUCT.md` as a business plan, and this document does not restate them.

The model estimates what the hosted service costs to run on Railway. It uses Railway's public pricing, read on 2026-11-01, and the service layout in `.railway/railway.ts`. It contains no figures from a running instance. Each measured input is a labelled `PLACEHOLDER` for the owner to fill, and a filled value is public because this repository is public.

## Railway rates

| Item           | Rate                                               | Source                                                                                                           |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| CPU            | $20 per vCPU per month                             | [Plans](https://docs.railway.com/reference/pricing/plans)                                                        |
| Memory         | $10 per GB per month                               | [Plans](https://docs.railway.com/reference/pricing/plans)                                                        |
| Volume storage | $0.15 per GB per month, on the space used          | [Plans](https://docs.railway.com/reference/pricing/plans), [Volumes](https://docs.railway.com/reference/volumes) |
| Network egress | $0.05 per GB                                       | [Plans](https://docs.railway.com/reference/pricing/plans)                                                        |
| Hobby plan     | $5 per month, includes $5 of usage                 | [Pricing](https://railway.com/pricing)                                                                           |
| Pro plan       | $20 per month per workspace, includes $20 of usage | [Pricing](https://railway.com/pricing)                                                                           |

Included usage resets each billing cycle and does not carry over. A plan bills the larger of its fee and the usage: $7 of usage on Hobby is a $7 bill ([Plans](https://docs.railway.com/reference/pricing/plans)).

## Service layout

From `.railway/railway.ts`. Every service has one replica in `europe-west4-drams3a`.

| Service           | Production | Staging | Role                                 |
| ----------------- | ---------- | ------- | ------------------------------------ |
| `uppity-server`   | Yes        | Yes     | Web tier, runs migrations pre-deploy |
| `worker-monitor`  | Yes        | Yes     | Schedules and runs health checks     |
| `worker-notifier` | Yes        | Yes     | Drains the notification queue        |
| `Postgres`        | Yes        | Yes     | Database                             |
| `Drizzle Gateway` | No         | Yes     | Database GUI, with its own volume    |

The production database volume `pg-volume-prod` is declared at 5,000 MB with online resize on.

## Measured inputs

Take the values from one measuring window and record its dates. Averages over the window fit the model better than peaks, because Railway bills what a service consumes.

| ID  | Input                                    | Value         |
| --- | ---------------------------------------- | ------------- |
| P1  | Railway plan in use                      | `PLACEHOLDER` |
| W1  | Measuring window, start and end dates    | `PLACEHOLDER` |
| L1  | Active monitors during W1                | `PLACEHOLDER` |
| L2  | Checks run during W1                     | `PLACEHOLDER` |
| C1  | Average vCPU, `uppity-server`            | `PLACEHOLDER` |
| C2  | Average vCPU, `worker-monitor`           | `PLACEHOLDER` |
| C3  | Average vCPU, `worker-notifier`          | `PLACEHOLDER` |
| C4  | Average vCPU, `Postgres`                 | `PLACEHOLDER` |
| M1  | Average memory in GB, `uppity-server`    | `PLACEHOLDER` |
| M2  | Average memory in GB, `worker-monitor`   | `PLACEHOLDER` |
| M3  | Average memory in GB, `worker-notifier`  | `PLACEHOLDER` |
| M4  | Average memory in GB, `Postgres`         | `PLACEHOLDER` |
| V1  | Volume space used in GB, `Postgres`      | `PLACEHOLDER` |
| E1  | Egress in GB per month, all services     | `PLACEHOLDER` |
| R1  | Stored bytes per check, indexes included | `PLACEHOLDER` |

## Formulas

Monthly usage for the deployment:

```text
usage = 20 * (C1 + C2 + C3 + C4) + 10 * (M1 + M2 + M3 + M4) + 0.15 * V1 + 0.05 * E1
bill  = max(plan fee, usage)
```

Staging adds its own usage on top, measured the same way.

Average cost per check, for a 30-day window:

```text
checks per month = L2 * 30 / days in W1
cost per check   = usage / checks per month
```

One window gives an average only. Separating fixed cost from the marginal cost of a check takes a second window at a different check rate:

```text
marginal cost per check = (usage B - usage A) / (checks B - checks A)
fixed cost              = usage A - marginal cost per check * checks A
```

`PRODUCT.md` says check load is the dominant marginal cost. This model treats that as an assumption until the two windows confirm it.

Margin on a plan, using the price and monitor count from `PRODUCT.md`:

```text
plan cost = monitors * checks per monitor per month * marginal cost per check + share of fixed cost
margin    = plan price - plan cost
```

A dedicated instance is a second copy of the layout, so its cost is a full `bill` of its own. Its load comes from the fair-use figure in `PRODUCT.md`.

## Check volume

These figures are arithmetic on a 30-day month, not measurements. A check interval sets the worst case, and 30 seconds is the default floor (`UPPITY_MIN_INTERVAL_SECONDS`).

| Interval | Checks per monitor per month | Checks per month, 50 monitors | Checks per month, 2,000 monitors |
| -------- | ---------------------------- | ----------------------------- | -------------------------------- |
| 30s      | 86,400                       | 4,320,000                     | 172,800,000                      |
| 60s      | 43,200                       | 2,160,000                     | 86,400,000                       |
| 120s     | 21,600                       | 1,080,000                     | 43,200,000                       |
| 300s     | 8,640                        | 432,000                       | 17,280,000                       |

Stored volume follows from retention. The retention windows are in the `PRODUCT.md` plan table.

```text
storage GB = checks per month * months retained * R1 / 1,000,000,000
```

## Cost of a unit of resource

These figures are Railway's rates applied to round quantities, not measurements of Uppity.

| Quantity                            | Monthly cost |
| ----------------------------------- | ------------ |
| 0.1 vCPU average                    | $2.00        |
| 100 MB memory average               | $1.00        |
| 1 GB volume space used              | $0.15        |
| The full 5,000 MB production volume | $0.75        |
| 10 GB egress                        | $0.50        |

## Assumptions and gaps

- Railway's docs do not say whether private network traffic or inbound traffic is billed. The model counts neither, because the rates name only egress. The first invoice settles this.
- Railway's docs do not mention price differences between regions. The model uses one rate everywhere.
- Railway's docs do not say how volume backups are billed. The model leaves them out.
- The model covers Railway only. It leaves out mail delivery, payment processing, domains, support time and tax.
