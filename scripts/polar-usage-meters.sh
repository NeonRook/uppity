#!/usr/bin/env bash
# Provisions the three usage-snapshot meters and archives the four retired
# create/delete meters they replace.
#
# Safe to re-run: creation is skipped when an unarchived meter of that name
# already exists, and archiving is skipped when the meter is absent or
# already archived. Meters do not replicate between sandbox and production,
# so this must be run once per environment.
#
# Usage:
#   POLAR_ACCESS_TOKEN=<token> ./polar-usage-meters.sh sandbox
#   POLAR_ACCESS_TOKEN=<token> ./polar-usage-meters.sh production
#
# The archive verb was confirmed empirically against sandbox: DELETE on a
# meter returns 405 Method Not Allowed, and PATCH with `archived_at` is
# silently ignored (200, but the field is absent from the MeterUpdate
# schema and nothing changes). The schema's actual archive field is the
# write-only `is_archived`; PATCHing `{"is_archived": true}` sets
# `archived_at` server-side and is what this script uses.
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

# Prints "<http-code>\n<body>". The code is returned on stdout rather than
# assigned to a global: every caller uses command substitution, which runs
# this in a subshell where an assignment would be discarded.
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

echo "=== Fetching existing meters ($ENVIRONMENT) ==="
RESP=$(req GET "/v1/meters/?limit=100")
CODE=$(code_of "$RESP")
EXISTING=$(body_of "$RESP")
if [ "$CODE" != "200" ]; then
	echo "ABORT: meters query returned HTTP $CODE" >&2
	printf '%s' "$EXISTING" | head -c 400 >&2
	echo >&2
	exit 1
fi

# Exact, unarchived match by name -- parses JSON rather than pattern-matching
# text, so "Monitors" cannot match "Monitors Created" and formatting
# (whitespace, key order) cannot break the lookup.
meter_id() { # name -> id of the unarchived meter with that name, or empty
	printf '%s' "$EXISTING" | python3 -c "
import json, sys
name = sys.argv[1]
for m in json.load(sys.stdin)['items']:
    if m['name'] == name and m['archived_at'] is None:
        print(m['id'])
        break
" "$1"
}

create_meter() { # name property
	local name="$1" property="$2" id resp code body
	id="$(meter_id "$name")"
	if [ -n "$id" ]; then
		echo "skip   $name (already exists, $id)"
		return
	fi
	resp=$(req POST "/v1/meters/" "$(cat <<JSON
{
  "name": "$name",
  "filter": {
    "conjunction": "and",
    "clauses": [
      { "property": "name", "operator": "eq", "value": "usage_snapshot" }
    ]
  },
  "aggregation": { "func": "max", "property": "$property" }
}
JSON
	)")
	code=$(code_of "$resp")
	body=$(body_of "$resp")
	if [ "$code" != "200" ] && [ "$code" != "201" ]; then
		echo "FAILED create $name (HTTP $code): $(printf '%s' "$body" | head -c 400)" >&2
		exit 1
	fi
	echo "create $name (max over $property)"
}

create_meter "Monitors" "monitors"
create_meter "Status Pages" "status_pages"
create_meter "Team Members" "team_members"

archive_meter() { # name
	local name="$1" id resp code body
	id="$(meter_id "$name")"
	if [ -z "$id" ]; then
		echo "skip    $name (absent or already archived)"
		return
	fi
	resp=$(req PATCH "/v1/meters/$id" '{"is_archived": true}')
	code=$(code_of "$resp")
	body=$(body_of "$resp")
	if [ "$code" != "200" ]; then
		echo "FAILED archive $name (HTTP $code): $(printf '%s' "$body" | head -c 400)" >&2
		exit 1
	fi
	echo "archive $name ($id)"
}

# Retired: a count of creations cannot express how many resources exist, and
# Polar cannot subtract one meter from another.
for retired in "Monitors Created" "Monitors Deleted" "Status Pages Created" "Status Pages Deleted"; do
	archive_meter "$retired"
done

echo
echo "=== Final meter state ($ENVIRONMENT) ==="
RESP=$(req GET "/v1/meters/?limit=100")
body_of "$RESP" | python3 -c "
import json, sys
for m in json.load(sys.stdin)['items']:
    agg = m['aggregation']
    print('%-22s %-6s %-14s archived=%s' % (
        m['name'], agg['func'], agg.get('property', '-'), m['archived_at'] is not None))
"
