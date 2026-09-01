#!/usr/bin/env bash
# Runs both Android Harness modes on the booted emulator: fake catalog, then real virtual scene.
set -euo pipefail

APP_APK_PATH="./android/app/build/outputs/apk/debug/app-debug.apk"
BUNDLE_ID="${HARNESS_ANDROID_BUNDLE_ID:?HARNESS_ANDROID_BUNDLE_ID is required}"
HARNESS_TIMEOUT_SECONDS="${HARNESS_ANDROID_TEST_TIMEOUT_SECONDS:-900}"
LOG_DIR="./android"

echo "Emulator virtual-scene poster support:"
emulator -help-virtualscene-poster || echo "warning: emulator does not advertise -virtualscene-poster"

echo "Waiting for emulator..."
adb wait-for-device
adb shell settings put global hidden_api_policy 1

echo "Installing APK from ${APP_APK_PATH}..."
adb install -r "${APP_APK_PATH}"
for permission in android.permission.CAMERA android.permission.RECORD_AUDIO; do
  adb shell pm grant "${BUNDLE_ID}" "${permission}" || true
done

if ! ls __tests__/*.harness.ts >/dev/null 2>&1; then
  echo "No Harness suites yet — build-only run."
  exit 0
fi

run_mode() {
  local script="$1"
  local label="$2"
  local catalog="${3:-default}"
  echo "=== ${label} (catalog: ${catalog}) ==="
  adb shell am force-stop "${BUNDLE_ID}" || true
  adb logcat -c || true
  set +e
  FAKE_CAMERA_CATALOG="${catalog}" timeout --foreground --kill-after=30s "${HARNESS_TIMEOUT_SECONDS}" bun run "${script}"
  local exit_code=$?
  set -e
  adb logcat -d > "${LOG_DIR}/logcat-${label}.txt" || true
  adb logcat -d -b crash > "${LOG_DIR}/logcat-crash-${label}.txt" || true
  adb shell am force-stop "${BUNDLE_ID}" || true
  if [[ "${exit_code}" -eq 124 ]]; then
    echo "${label}: Harness tests exceeded ${HARNESS_TIMEOUT_SECONDS}s and were aborted."
    return 1
  fi
  return "${exit_code}"
}

status=0
if [[ -f android/app/src/main/java/com/margelo/nitro/camera/example/fake/camerax/FakeCameraCatalogConfig.kt ]]; then
  run_mode test:harness:android fake-catalog default || status=1
  run_mode test:harness:android-variants variants-catalog variants || status=1
else
  echo "Android fake catalog not implemented yet — skipping the fake-catalog runner."
fi
run_mode test:harness:android-scene virtual-scene || status=1
exit "${status}"
