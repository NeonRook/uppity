#!/usr/bin/env bash
# Provisions the `monitor_blocks` meter and stacks a metered capacity-block price
# on both Uppity products.
#
# Safe to re-run: the meter is created only when no unarchived meter of that name
# exists, and a product is skipped once it already carries a metered price bound
# to that meter. Meters and products do not replicate between sandbox and
# production, so this must be run once per environment.
#
# Usage:
#   POLAR_ACCESS_TOKEN=<token> \
#   POLAR_PRODUCT_UPPITY_MONTHLY=<uuid> POLAR_PRODUCT_UPPITY_ANNUAL=<uuid> \
#     ./polar-capacity-blocks.sh sandbox
#
# The token this needs is NOT the runtime token. POLAR_SETUP.md deliberately
# withholds products write from the deployed application, so that a leaked
# runtime token cannot re-price the live catalogue. Issue a separate token with
# products write, run this, then delete it.
#
# Why a metered price rather than a quantity: Polar bills a metered price as
# `unit_amount x meter_value`, and the meter value comes only from events Uppity
# ingests. Polar therefore never holds an authoritative block count and none
# flows back — the database is the source of truth. See docs/adr/0002.
#
# On the annual product the meter's window is the subscription's own interval, a
# full year, because `meter_interval` is settable on neither product create nor
# update. `max(blocks) x $80` is charged at renewal however briefly the blocks
# were held. That matches the published $80/yr price and the billing UI has to
# say so.
set -euo pipefail

ENVIRONMENT="${1:?usage: $0 <sandbox|production>}"
case "$ENVIRONMENT" in
	sandbox) BASE="https://sandbox-api.polar.sh" ;;
	production) BASE="https://api.polar.sh" ;;
	*)
		echo "unknown environment: $ENVIRONMENT" >&2
		exit 1
		;;
esac
: "${POLAR_ACCESS_TOKEN:?POLAR_ACCESS_TOKEN must be set}"
: "${POLAR_PRODUCT_UPPITY_MONTHLY:?POLAR_PRODUCT_UPPITY_MONTHLY must be set}"
: "${POLAR_PRODUCT_UPPITY_ANNUAL:?POLAR_PRODUCT_UPPITY_ANNUAL must be set}"

METER_NAME="Monitor Blocks"
# The event name and the aggregated property must match `METER_EVENTS.MONITOR_BLOCKS`
# and the metadata key in `toBlocksIngestEvent` — src/lib/server/services/meter.service.ts.
EVENT_NAME="monitor_blocks"
AGGREGATION_PROPERTY="blocks"

# Cents per block, mirroring MONITOR_BLOCK_PRICE_CENTS and
# MONITOR_BLOCK_ANNUAL_PRICE_CENTS in src/lib/constants/plans.ts. Changing a price
# there and not here bills a number the product does not advertise.
MONTHLY_UNIT_AMOUNT=800
ANNUAL_UNIT_AMOUNT=8000

# Prints "<http-code>\n<body>".
req() { # method path [body]
	local method="$1" path="$2" body="${3:-}" raw
	if [ -n "$body" ]; then
		raw=$(curl -sS -X "$method" -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" -H "Content-Type: application/json" \
			-d "$body" -w '\n__HTTP__%{http_code}' "$BASE$path")
	else
		raw=$(curl -sS -X "$method" -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" \
			-w '\n__HTTP__%{http_code}' "$BASE$path")
	fi
	printf '%s\n' "${raw##*__HTTP__}"
	printf '%s' "${raw%$'\n'__HTTP__*}"
}

code_of() { printf '%s' "$1" | head -n 1; }
body_of() { printf '%s' "$1" | tail -n +2; }

echo "=== Ensuring the $METER_NAME meter ($ENVIRONMENT) ==="

RESP=$(req GET "/v1/meters/?limit=100")
CODE=$(code_of "$RESP")
EXISTING=$(body_of "$RESP")
if [ "$CODE" != "200" ]; then
	echo "ABORT: meters query returned HTTP $CODE" >&2
	printf '%s' "$EXISTING" | head -c 400 >&2
	echo >&2
	exit 1
fi

# Prints "<verdict>\n<id-or-reason>". A meter found by name is only adopted once its
# filter and aggregation are confirmed to match: a hand-made "Monitor Blocks" summing
# the wrong property would otherwise be adopted silently and misbill every customer,
# and nothing downstream would report an error.
LOOKUP=$(printf '%s' "$EXISTING" | python3 -c "
import json, sys

name, event_name, prop = sys.argv[1], sys.argv[2], sys.argv[3]
payload = json.load(sys.stdin)

total = payload.get('pagination', {}).get('total_count')
if isinstance(total, int) and total > len(payload['items']):
    print('ABORT')
    print('meters listing truncated (%d of %d); cannot rule out an existing meter' % (len(payload['items']), total))
    sys.exit(0)

for m in payload['items']:
    if m['name'] != name or m['archived_at'] is not None:
        continue
    clauses = (m.get('filter') or {}).get('clauses') or []
    agg = m.get('aggregation') or {}
    matches = (
        any(c.get('property') == 'name' and c.get('operator') == 'eq' and c.get('value') == event_name
            for c in clauses)
        and agg.get('func') == 'max'
        and agg.get('property') == prop
    )
    if matches:
        print('OK')
        print(m['id'])
    else:
        print('ABORT')
        print('meter %s exists but filters/aggregates differently: filter=%s aggregation=%s'
              % (m['id'], json.dumps(m.get('filter')), json.dumps(agg)))
    sys.exit(0)

print('NONE')
print('')
" "$METER_NAME" "$EVENT_NAME" "$AGGREGATION_PROPERTY")

LOOKUP_VERDICT=$(printf '%s' "$LOOKUP" | head -n 1)
LOOKUP_DETAIL=$(printf '%s' "$LOOKUP" | tail -n +2)

if [ "$LOOKUP_VERDICT" = "ABORT" ]; then
	echo "ABORT: $LOOKUP_DETAIL" >&2
	exit 1
fi

METER_ID=""
if [ "$LOOKUP_VERDICT" = "OK" ]; then
	METER_ID="$LOOKUP_DETAIL"
fi

if [ -n "$METER_ID" ]; then
	echo "skip   $METER_NAME (already exists, $METER_ID)"
else
	RESP=$(req POST "/v1/meters/" "$(
		cat <<JSON
{
  "name": "$METER_NAME",
  "filter": {
    "conjunction": "and",
    "clauses": [
      { "property": "name", "operator": "eq", "value": "$EVENT_NAME" }
    ]
  },
  "aggregation": { "func": "max", "property": "$AGGREGATION_PROPERTY" }
}
JSON
	)")
	CODE=$(code_of "$RESP")
	BODY=$(body_of "$RESP")
	if [ "$CODE" != "200" ] && [ "$CODE" != "201" ]; then
		echo "FAILED create $METER_NAME (HTTP $CODE): $(printf '%s' "$BODY" | head -c 400)" >&2
		exit 1
	fi
	METER_ID=$(printf '%s' "$BODY" | python3 -c "import json, sys; print(json.load(sys.stdin)['id'])")
	echo "create $METER_NAME (max over $AGGREGATION_PROPERTY, $METER_ID)"
fi

echo
echo "=== Stacking the metered price on the Uppity products ==="

# PATCH /v1/products/{id} REPLACES the price list, so every price to keep must be
# re-sent by id alongside the new one. Dropping the base price makes the plan free.
build_payload() { # product_json unit_amount -> "<verdict>\n<payload-or-reason>"
	printf '%s' "$1" | python3 -c "
import json, sys

meter_id, unit_amount = sys.argv[1], int(sys.argv[2])
product = json.load(sys.stdin)
prices = [p for p in product['prices'] if not p.get('is_archived')]

def meter_of(price):
    return price.get('meter_id') or (price.get('meter') or {}).get('id')

metered = [p for p in prices if p.get('amount_type') == 'metered_unit']

if any(meter_of(p) == meter_id for p in metered):
    print('SKIP')
    print('already carries a metered price for this meter')
    sys.exit(0)

# A metered price bound to some other meter is not ours to reason about. Keeping it and
# appending would leave two metered prices on the product, and if the other one also
# filters on monitor_blocks events every block is billed twice. Reachable by archiving
# or renaming the meter and re-running, which looks like a repair.
if metered:
    print('ABORT')
    print('carries %d metered price(s) bound to another meter: %s'
          % (len(metered), ', '.join(sorted(str(meter_of(p)) for p in metered))))
    sys.exit(0)

static = [p for p in prices if p.get('amount_type') in ('fixed', 'custom', 'free')]
if len(static) != 1:
    print('ABORT')
    print('expected exactly one unarchived static price, found %d' % len(static))
    sys.exit(0)

keep = [{'id': p['id']} for p in prices]
keep.append({'amount_type': 'metered_unit', 'meter_id': meter_id, 'unit_amount': unit_amount})
print('PATCH')
print(json.dumps({'prices': keep}))
" "$METER_ID" "$2"
}

stack_price() { # label product_id unit_amount
	local label="$1" product_id="$2" unit_amount="$3" resp code body result verdict payload

	resp=$(req GET "/v1/products/$product_id")
	code=$(code_of "$resp")
	body=$(body_of "$resp")
	if [ "$code" != "200" ]; then
		echo "FAILED read $label (HTTP $code): $(printf '%s' "$body" | head -c 400)" >&2
		exit 1
	fi

	result=$(build_payload "$body" "$unit_amount")
	verdict=$(printf '%s' "$result" | head -n 1)
	payload=$(printf '%s' "$result" | tail -n +2)

	case "$verdict" in
		SKIP)
			echo "skip   $label ($payload)"
			return
			;;
		ABORT)
			echo "ABORT: $label $payload" >&2
			echo "Refusing to rewrite the price list of a product whose shape is unexpected." >&2
			exit 1
			;;
	esac

	echo "patch  $label -> $payload"
	resp=$(req PATCH "/v1/products/$product_id" "$payload")
	code=$(code_of "$resp")
	body=$(body_of "$resp")
	if [ "$code" != "200" ]; then
		echo "FAILED patch $label (HTTP $code): $(printf '%s' "$body" | head -c 400)" >&2
		exit 1
	fi
	echo "stack  $label ($unit_amount cents per block)"
}

stack_price "Uppity (monthly)" "$POLAR_PRODUCT_UPPITY_MONTHLY" "$MONTHLY_UNIT_AMOUNT"
stack_price "Uppity (annual)" "$POLAR_PRODUCT_UPPITY_ANNUAL" "$ANNUAL_UNIT_AMOUNT"

echo
echo "=== Final price state ($ENVIRONMENT) ==="
for product_id in "$POLAR_PRODUCT_UPPITY_MONTHLY" "$POLAR_PRODUCT_UPPITY_ANNUAL"; do
	body_of "$(req GET "/v1/products/$product_id")" | python3 -c "
import json, sys
product = json.load(sys.stdin)
print(product['name'])
for price in product['prices']:
    if price.get('is_archived'):
        continue
    amount = price.get('price_amount', price.get('unit_amount'))
    print('  %-14s %s cents' % (price['amount_type'], amount))
"
done
