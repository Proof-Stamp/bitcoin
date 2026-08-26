#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/rust/sha256-wasm/Cargo.toml"
WASM="$ROOT/rust/sha256-wasm/target/wasm32-unknown-unknown/release/proofstamp_sha256_wasm.wasm"
GENERATED="$ROOT/src/rust-sha256-wasm.js"

rustup target add wasm32-unknown-unknown >/dev/null
cargo build --manifest-path "$MANIFEST" --release --target wasm32-unknown-unknown --locked
node "$ROOT/scripts/check-rust-wasm.mjs" "$WASM"
node "$ROOT/scripts/embed-rust-wasm.mjs" "$WASM" "$GENERATED"
