#!/usr/bin/env bash
set -euo pipefail

root="tests/fixtures/opentimestamps"

for proof in \
  "$root/hello-world.txt.ots" \
  "$root/incomplete.txt.ots"
do
  echo "canonical client accepts $proof"
  ots info "$proof" >/dev/null

done

for proof in \
  "$root/invalid/bad-major-version.ots" \
  "$root/invalid/exceeds-max-msg-length.ots" \
  "$root/invalid/invalid-file-digest-type.ots"
do
  echo "canonical client rejects $proof"
  if ots info "$proof" >/dev/null 2>&1; then
    echo "ERROR: canonical client unexpectedly accepted invalid fixture: $proof" >&2
    exit 1
  fi
done
