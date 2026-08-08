#!/usr/bin/env bash
#
# Deploy the built app to a sprite (https://sprites.dev), creating it if it does not exist.
#
#   scripts/deploy-sprite.sh <sprite-name> [--public]
#
# Safe to run repeatedly: the same name redeploys in place and keeps its URL, so this is
# both "deploy" and "redeploy". Use it after any code change, and after any change to the
# build-time configuration described below.
#
# WHAT CROSSES THE MACHINE BOUNDARY. The app is built here and only the output is uploaded.
# The sprite has no repository, no toolchain and no environment file — it could not build
# this even if it wanted to, because the Compact compiler is not installed there. So the
# configuration that matters is whatever was in effect *locally at build time*:
#
#   - `app/.env.local` is read by Vite here, and every VITE_ variable is inlined into the
#     bundle. Those values are therefore published, readable by any visitor. The issuer
#     seed is one of them. See `app/.env.example`, which says so at length.
#   - `contract/.env.preview` holds the deploy seed and the admin secret. It is read only
#     by the Node scripts in `contract/`, never by the build, and never leaves this
#     machine. Nothing in it reaches the sprite.
#
# Changing a VITE_ variable means rebuilding and running this again. Changing
# `contract/.env.preview` alone changes nothing about what is deployed.

set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

sprite=${1:-}
public=false
for arg in "${@:2}"; do
  case "$arg" in
    --public) public=true ;;
    *) echo "unknown option: $arg" >&2; exit 1 ;;
  esac
done

if [ -z "$sprite" ]; then
  echo "usage: scripts/deploy-sprite.sh <sprite-name> [--public]" >&2
  echo "example: scripts/deploy-sprite.sh hackbuenosaires-260808-adepe --public" >&2
  exit 1
fi

command -v sprite >/dev/null || { echo "the 'sprite' CLI is not on PATH" >&2; exit 1; }

# The service name is fixed. Only one service per sprite may claim the HTTP port, and
# reusing the name is what makes a second run a redeploy rather than a conflict.
service=adepe
remote=/home/sprite/site

echo "==> building"
make -C "$root" build >/dev/null

echo "==> packaging"
staging=$(mktemp -d -t adepe-deploy)
trap 'rm -rf "$staging"' EXIT
tarball="$staging/dist.tgz"
# COPYFILE_DISABLE keeps macOS from writing an AppleDouble `._foo` beside every entry,
# which would otherwise unpack as junk files into the served directory.
COPYFILE_DISABLE=1 tar czf "$tarball" -C "$root/app/dist" .
echo "    $(du -h "$tarball" | cut -f1)"

if sprite ls 2>/dev/null | grep -Fxq "$sprite"; then
  echo "==> using existing sprite $sprite"
else
  echo "==> creating sprite $sprite"
  sprite create -skip-console "$sprite" >/dev/null
fi

echo "==> uploading"
sprite exec -s "$sprite" \
  -file "$tarball:/home/sprite/dist.tgz" \
  -file "$root/scripts/serve.mjs:/home/sprite/serve.mjs" \
  sh -lc "
    set -e
    rm -rf $remote && mkdir -p $remote
    tar xzf /home/sprite/dist.tgz -C $remote 2>/dev/null
    rm -f /home/sprite/dist.tgz
  "

# Services survive reboots, restart on crash, and are started again by an incoming request
# after the sprite has paused. A backgrounded process is not an option: anything started
# from an exec session is killed when that session ends.
echo "==> service"
sprite exec -s "$sprite" sh -lc "
  set -e
  env=/.sprite/bin/sprite-env
  if \$env services get $service >/dev/null 2>&1; then
    \$env services restart $service
  else
    \$env services create $service \
      --cmd node --args /home/sprite/serve.mjs \
      --env PORTS=8080,SITE_ROOT=$remote \
      --http-port 8080 --no-stream
  fi
" >/dev/null

if [ "$public" = true ]; then
  echo "==> making the URL public"
  sprite url update --auth public -s "$sprite" >/dev/null
fi

url=$(sprite url -s "$sprite" | awk '/^URL:/ { print $2 }')

# Worth a real check rather than a cheerful message: a 200 here means the proxy found the
# service and the service found the files. Anything else and the deploy did not land.
echo "==> verifying $url"
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 60 "$url/")
if [ "$code" = 200 ]; then
  echo "    ok"
elif [ "$code" = 302 ] && [ "$public" != true ]; then
  echo "    ok (redirect to sign-in: the URL is private, pass --public to open it)"
else
  echo "    unexpected response $code" >&2
  exit 1
fi

echo
echo "$url"
