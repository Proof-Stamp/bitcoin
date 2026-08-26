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

python3 -m http.server 4173 --bind 127.0.0.1 --directory dist >"$server_log" 2>&1 &
server_pid=$!
"$chrome" \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
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

# GitHub-hosted runners can occasionally take several seconds to expose the
# Chrome DevTools endpoint after a cold browser start. Keep the smoke test
# strict, but allow enough startup time before treating that as a failure.
for _ in $(seq 1 150); do
  if curl --fail --silent http://127.0.0.1:4173/ >/dev/null && curl --fail --silent http://127.0.0.1:9222/json/version >/dev/null; then
    break
  fi
  sleep 0.1
done

if ! curl --fail --silent http://127.0.0.1:4173/ >/dev/null; then
  cat "$server_log" >&2
  exit 1
fi
if ! curl --fail --silent http://127.0.0.1:9222/json/version >/dev/null; then
  cat "$chrome_log" >&2
  exit 1
fi

node scripts/browser-smoke.mjs \
  http://127.0.0.1:4173/ \
  tests/fixtures/opentimestamps/hello-world.txt
