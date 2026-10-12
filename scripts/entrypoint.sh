#!/bin/sh
# Runs one Uppity process on Node.
#
# serve and migrate run under Node's permission model. Reads are scoped to the
# trees each one loads, and filesystem writes, child processes, worker threads,
# native addons, WASI and FFI are denied: those are what turn a compromised
# dependency into code execution or persistence, and neither process needs them.
#
# Network access is all or nothing. Node's --allow-net takes no host list, so
# both processes can reach any address. docs/adr/0008 records why that was
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
	run --permission --allow-net --allow-fs-read=./build ./build/index.js
	;;
migrate)
	run --permission --allow-net --allow-fs-read=./drizzle --allow-fs-read=./build ./build/migrate.js
	;;
worker-monitor | worker-notifier)
	run "./build/$target.js"
	;;
esac
