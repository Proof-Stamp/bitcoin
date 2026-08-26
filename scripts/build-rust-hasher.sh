#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/rust/sha256-wasm/Cargo.toml"
WASM="$ROOT/rust/sha256-wasm/target/wasm32-unknown-unknown/release/proofstamp_sha256_wasm.wasm"
GENERATED="$ROOT/src/rust-sha256-wasm.js"

bootstrap_cloudflare_rustup() {
  if [ "${CF_PAGES:-}" != "1" ]; then
    echo "rustup is required to build the Rust/WASM SHA-256 module" >&2
    exit 1
  fi

  if [ "$(uname -s)" != "Linux" ] || [ "$(uname -m)" != "x86_64" ]; then
    echo "Unsupported Cloudflare Pages build platform for Rust bootstrap" >&2
    exit 1
  fi

  local rust_channel
  rust_channel="$(sed -n 's/^channel = "\([^"]*\)"$/\1/p' "$ROOT/rust-toolchain.toml")"
  if [ -z "$rust_channel" ]; then
    echo "Could not read pinned Rust channel from rust-toolchain.toml" >&2
    exit 1
  fi

  local rustup_version="1.29.0"
  local rustup_target="x86_64-unknown-linux-gnu"
  local rustup_url="https://static.rust-lang.org/rustup/archive/${rustup_version}/${rustup_target}/rustup-init"
  local tmp_dir
  tmp_dir="$(mktemp -d)"

  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 3 \
    "$rustup_url" -o "$tmp_dir/rustup-init"
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 3 \
    "${rustup_url}.sha256" -o "$tmp_dir/rustup-init.sha256"

  local expected_sha256
  expected_sha256="$(awk '{print $1; exit}' "$tmp_dir/rustup-init.sha256")"
  if ! printf '%s  %s\n' "$expected_sha256" "$tmp_dir/rustup-init" | sha256sum --check --status; then
    echo "rustup-init checksum verification failed" >&2
    rm -rf "$tmp_dir"
    exit 1
  fi

  chmod +x "$tmp_dir/rustup-init"
  "$tmp_dir/rustup-init" \
    -y \
    --no-modify-path \
    --profile minimal \
    --default-toolchain "$rust_channel"
  rm -rf "$tmp_dir"

  export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
}

if ! command -v rustup >/dev/null 2>&1; then
  bootstrap_cloudflare_rustup
fi

rustup target add wasm32-unknown-unknown >/dev/null
cargo build --manifest-path "$MANIFEST" --release --target wasm32-unknown-unknown --locked
node "$ROOT/scripts/check-rust-wasm.mjs" "$WASM"
node "$ROOT/scripts/embed-rust-wasm.mjs" "$WASM" "$GENERATED"
node "$ROOT/scripts/check-dual-local-hash.mjs"
