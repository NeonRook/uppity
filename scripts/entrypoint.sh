#!/bin/sh
# Runs one Uppity process under a Deno permission set scoped to what that
# process needs, in place of `deno run -A`.
#
# The network allowlist cannot be baked into the image. The Postgres and SMTP
# hosts arrive as environment variables at container start, so they are read
# here and assembled into --allow-net entries.
#
# Every process runs without --allow-write, --allow-run and --allow-ffi. Those
# are the flags that turn a compromised dependency into code execution, and
# nothing here needs them. --allow-sys is granted for "hostname" alone, which
# the logger reads once to stamp its base fields.
#
# --allow-env stays unrestricted. The Deno adapter's generated handler hands
# SvelteKit its dynamic env bag with Deno.env.toObject(), which reads the whole
# environment and fails under any allowlist, however long. The workers do not
# go through the adapter and could be narrowed, but dev runs on Node, where
# Deno's permissions do not exist, so a missing entry would surface first in
# production. The environment holds only what these processes already need.
#
# Set UPPITY_PRINT_PERMISSIONS=1 to print the deno command instead of running
# it. entrypoint.spec.ts uses this to check the host parsing.
set -eu

# host[:port] out of a URL. Path and query go first so that an "@" in either
# cannot be mistaken for the end of the credentials.
url_host() {
	rest=${1#*://}
	rest=${rest%%/*}
	rest=${rest%%\?*}
	rest=${rest##*@}
	printf '%s' "$rest"
}

# Blank entries are dropped rather than appended. An empty element in a Deno
# allowlist is a parse error, and silently widening the list would be worse.
net=""
allow_host() {
	[ -n "${1:-}" ] || return 0
	net="${net:+$net,}$1"
}

# exec, unless asked to show the command instead.
run() {
	if [ -n "${UPPITY_PRINT_PERMISSIONS:-}" ]; then
		echo "deno run $*"
		exit 0
	fi
	exec deno run "$@"
}

target=${1:-}

case "$target" in
serve | migrate | worker-monitor | worker-notifier) ;;
*)
	echo "usage: entrypoint.sh serve|migrate|worker-monitor|worker-notifier" >&2
	exit 64
	;;
esac

if [ -z "${DATABASE_URL:-}" ]; then
	echo "entrypoint: DATABASE_URL is not set, so $target has nowhere to connect" >&2
	exit 78
fi

# Postgres. The workers end up with unrestricted --allow-net and ignore this,
# so it is assembled only for the two processes that use an allowlist.
allow_host "$(url_host "$DATABASE_URL")"

if [ "$target" = serve ]; then
	# The listening socket needs its own entry; binding is a net operation.
	allow_host "${HOST:-0.0.0.0}:${PORT:-3000}"
	# Password reset mail. auth.ts sends nothing unless both are set.
	allow_host "${SMTP_HOST:-}${SMTP_PORT:+:$SMTP_PORT}"
	# Billing. Self-hosted instances leave the token unset and never call Polar,
	# so the host stays off the list entirely rather than being allowed unused.
	if [ -n "${POLAR_ACCESS_TOKEN:-}" ]; then
		case "${POLAR_SERVER:-}" in
		sandbox) allow_host "sandbox-api.polar.sh:443" ;;
		*) allow_host "api.polar.sh:443" ;;
		esac
	fi
fi

case "$target" in
serve)
	# .deno-deploy holds the SSR chunks and the static assets named in
	# deploy.json; build/ holds this bundle and its chunks.
	run \
		--allow-env \
		--allow-sys=hostname \
		--allow-read=./.deno-deploy,./build \
		--allow-net="$net" \
		./build/serve.js
	;;
migrate)
	run \
		--allow-env \
		--allow-sys=hostname \
		--allow-read=./drizzle,./build \
		--allow-net="$net" \
		./build/migrate.js
	;;
worker-monitor | worker-notifier)
	# Both workers dial hosts that users type into a form: worker-monitor probes
	# arbitrary URLs, worker-notifier posts to arbitrary Discord, Slack and
	# webhook endpoints. That is the product working as designed, so their
	# --allow-net is unrestricted and no configuration narrows it. What they do
	# give up is write, run and ffi, and reads outside the bundle directory.
	run \
		--allow-env \
		--allow-sys=hostname \
		--allow-read=./build \
		--allow-net \
		"./build/$target.js"
	;;
esac
