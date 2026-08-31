#!/usr/bin/env bash
# Verify SonotokiKit (the platform-agnostic core) on a non-Mac machine.
#
# It's pure Foundation value types — no CoreLocation / SwiftUI / SwiftData — so the
# official Swift Linux image compiles it and runs the full XCTest suite. This does
# NOT cover ../App/ (SwiftData/SwiftUI/CoreLocation) — that still needs a Mac.
#
# Requires Docker (Docker Desktop running on Windows is fine). From this folder:
#   ./test-linux.sh              # swift test
#   ./test-linux.sh build        # swift build only
#   ./test-linux.sh 6.0 test     # pin a Swift version

set -euo pipefail
cd "$(dirname "$0")"

image="swift:6.1"
cmd="test"
for arg in "$@"; do
  case "$arg" in
    build|test) cmd="$arg" ;;
    [0-9]*)     image="swift:$arg" ;;
  esac
done

# MSYS_NO_PATHCONV stops Git Bash from mangling the container path.
MSYS_NO_PATHCONV=1 exec docker run --rm \
  -v "$(pwd -W 2>/dev/null || pwd):/pkg" -w /pkg \
  "$image" swift "$cmd"
