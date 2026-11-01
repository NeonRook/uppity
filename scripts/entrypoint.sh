#!/bin/sh
# Runs one Uppity process on Node.
#
# Every process runs under Node's permission model. Reads are scoped to the
# build and its production dependencies, and filesystem writes, child processes, worker threads,
# native addons, WASI and FFI are denied: those are what turn a compromised
# dependency into code execution or persistence, and no process needs them.
#
# Network access is all or nothing. Node's --allow-net takes no host list, so
# every process can reach any address. The workers need that anyway: they dial
# whatever URLs and endpoints users configure. docs/adr/0008 records why that was
# accepted.
#
# Set UPPITY_PRINT_PERMISSIONS=1 to print the node command instead of running
# it. entrypoint.spec.ts uses this to check the flags.
set -eu

# exec, unless asked to show the command instead.
run() {
	if [ -n "${UPPITY_PRINT_PERMISSIONS:-}" ]; then
		echo "node $*"
		exit 0
	fi
	exec node "$@"
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

case "$target" in
serve)
	run --permission --allow-net --allow-fs-read=./build --allow-fs-read=./node_modules \
		--import=./build/telemetry.js ./build/serve.js
	;;
migrate)
	run --permission --allow-net --allow-fs-read=./drizzle --allow-fs-read=./build \
		--allow-fs-read=./node_modules ./build/migrate.js
	;;
worker-monitor | worker-notifier)
	run --permission --allow-net --allow-fs-read=./build --allow-fs-read=./node_modules \
		--import=./build/telemetry.js "./build/$target.js"
	;;
esac
