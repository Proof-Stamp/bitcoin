#!/usr/bin/env bash
set -euo pipefail

chrome="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser || true)"
if [ -z "$chrome" ]; then
  echo "No supported Chrome/Chromium binary found on the CI runner" >&2
  exit 1
fi

server_log="$(mktemp)"
chrome_log="$(mktemp)"
profile_dir="$(mktemp -d)"
devtools_port_file="$profile_dir/DevToolsActivePort"

python3 -m http.server 4173 --bind 127.0.0.1 --directory dist >"$server_log" 2>&1 &
server_pid=$!
env -u DBUS_SESSION_BUS_ADDRESS "$chrome" \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=0 \
  --user-data-dir="$profile_dir" \
  about:blank >"$chrome_log" 2>&1 &
chrome_pid=$!

cleanup() {
  local profile_removed=false

  kill "$chrome_pid" 2>/dev/null || true
  wait "$chrome_pid" 2>/dev/null || true

  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true

  for _ in $(seq 1 20); do
    if rm -rf "$profile_dir" 2>/dev/null; then
      profile_removed=true
      break
    fi
    sleep 0.1
  done

  if [ "$profile_removed" != true ]; then
    echo "Warning: could not remove Chrome profile directory after retries: $profile_dir" >&2
  fi
  rm -f "$server_log" "$chrome_log" 2>/dev/null || true
}
trap cleanup EXIT

# Let Chrome choose an unused DevTools port and publish it in the isolated
# profile. This avoids collisions with services that may already occupy 9222
# on a GitHub-hosted runner. Fail early if Chrome exits before publishing it.
devtools_port=""
for _ in $(seq 1 300); do
  if ! kill -0 "$chrome_pid" 2>/dev/null; then
    echo "Chrome exited before the DevTools endpoint became ready" >&2
    cat "$chrome_log" >&2
    exit 1
  fi
  if [ -s "$devtools_port_file" ]; then
    devtools_port="$(head -n 1 "$devtools_port_file")"
    if [[ "$devtools_port" =~ ^[0-9]+$ ]] && \
      curl --fail --silent http://127.0.0.1:4173/ >/dev/null && \
      curl --fail --silent "http://127.0.0.1:${devtools_port}/json/version" >/dev/null; then
      break
    fi
  fi
  sleep 0.1
done

if ! curl --fail --silent http://127.0.0.1:4173/ >/dev/null; then
  cat "$server_log" >&2
  exit 1
fi
if ! [[ "$devtools_port" =~ ^[0-9]+$ ]] || \
  ! curl --fail --silent "http://127.0.0.1:${devtools_port}/json/version" >/dev/null; then
  echo "Chrome DevTools endpoint did not become ready" >&2
  cat "$chrome_log" >&2
  exit 1
fi

node scripts/browser-smoke.mjs \
  http://127.0.0.1:4173/ \
  tests/fixtures/opentimestamps/hello-world.txt \
  "http://127.0.0.1:${devtools_port}"
