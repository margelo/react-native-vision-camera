#!/usr/bin/env bash
# Builds FakeSimulatedCamera.app for the iOS Simulator and prints its path.
set -euo pipefail

cd "$(dirname "$0")/../ios"

DERIVED_DATA="${HARNESS_IOS_DERIVED_DATA_OUTPUT:-$PWD/build/simulator}"
APP_PATH="$DERIVED_DATA/Build/Products/Debug-iphonesimulator/FakeSimulatedCamera.app"

xcodebuild \
  -workspace FakeSimulatedCamera.xcworkspace \
  -scheme FakeSimulatedCamera \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  COMPILER_INDEX_STORE_ENABLE=NO \
  build "${@}" | tail -20

test -d "$APP_PATH"
echo "HARNESS_APP_PATH=$APP_PATH"
