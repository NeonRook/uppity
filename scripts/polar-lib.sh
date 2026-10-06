# shellcheck shell=bash
# Shared by the polar-*.sh provisioning scripts. Source it after `set -euo pipefail`;
# it takes the environment from $1 of the sourcing script.

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

# Sets EXISTING to the meters listing JSON, or aborts.
fetch_meters() {
	local resp code
	resp=$(req GET "/v1/meters/?limit=100")
	code=$(code_of "$resp")
	EXISTING=$(body_of "$resp")
	if [ "$code" != "200" ]; then
		echo "ABORT: meters query returned HTTP $code" >&2
		printf '%s' "$EXISTING" | head -c 400 >&2
		echo >&2
		exit 1
	fi
}
