/*
 * Copyright 2023 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// Vendored from AOSP platform/frameworks/support@bb117e26ce89b888d6f928ff7b604913a1da43f2 (camera-core 1.7.0-alpha03), see THIRD_PARTY.md.

package androidx.camera.testing.impl.fakes;

import androidx.annotation.RestrictTo;
import androidx.camera.core.CameraInfo;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.concurrent.CameraCoordinator;
import androidx.camera.core.impl.CameraUpdateException;

import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A {@link CameraCoordinator} implementation that contains concurrent camera mode and camera id
 * information.
 *
 */
@RestrictTo(RestrictTo.Scope.LIBRARY_GROUP)
public class FakeCameraCoordinator implements CameraCoordinator {

    private @NonNull Map<String, String> mConcurrentCameraIdMap;
    private @NonNull List<List<String>> mConcurrentCameraIds;
    private @NonNull List<List<CameraSelector>> mConcurrentCameraSelectors;
    private @NonNull List<CameraInfo> mActiveConcurrentCameraInfos;
    private final @NonNull List<ConcurrentCameraModeListener> mConcurrentCameraModeListeners;
    private boolean mShouldThrow = false;
    private int mCameraUpdateCount = 0;

    @CameraOperatingMode private int mCameraOperatingMode;

    public FakeCameraCoordinator() {
        mConcurrentCameraIdMap = new HashMap<>();
        mConcurrentCameraIds = new ArrayList<>();
        mConcurrentCameraSelectors = new ArrayList<>();
        mActiveConcurrentCameraInfos = new ArrayList<>();
        mConcurrentCameraModeListeners = new ArrayList<>();
    }

    /**
     * Adds concurrent camera id and camera selectors.
     *
     * @param cameraIdAndSelectors combinations of camera id and selector.
     */
    public void addConcurrentCameraIdsAndCameraSelectors(
            @NonNull Map<String, CameraSelector> cameraIdAndSelectors) {
        mConcurrentCameraIds.add(new ArrayList<>(cameraIdAndSelectors.keySet()));
        mConcurrentCameraSelectors.add(new ArrayList<>(cameraIdAndSelectors.values()));

        for (List<String> concurrentCameraIdList: mConcurrentCameraIds) {
            List<String> cameraIdList = new ArrayList<>(concurrentCameraIdList);
            mConcurrentCameraIdMap.put(cameraIdList.get(0), cameraIdList.get(1));
            mConcurrentCameraIdMap.put(cameraIdList.get(1), cameraIdList.get(0));
        }
    }

    @Override
    public @NonNull List<List<CameraSelector>> getConcurrentCameraSelectors() {
        return mConcurrentCameraSelectors;
    }

    @Override
    public @NonNull List<CameraInfo> getActiveConcurrentCameraInfos() {
        return mActiveConcurrentCameraInfos;
    }

    @Override
    public void setActiveConcurrentCameraInfos(@NonNull List<CameraInfo> cameraInfos) {
        mActiveConcurrentCameraInfos = cameraInfos;
    }

    @Override
    public @Nullable String getPairedConcurrentCameraId(@NonNull String cameraId) {
        if (mConcurrentCameraIdMap.containsKey(cameraId)) {
            return mConcurrentCameraIdMap.get(cameraId);
        }
        return null;
    }

    @CameraOperatingMode
    @Override
    public int getCameraOperatingMode() {
        return mCameraOperatingMode;
    }

    @Override
    public void setCameraOperatingMode(@CameraOperatingMode int cameraOperatingMode) {
        if (cameraOperatingMode != mCameraOperatingMode) {
            for (ConcurrentCameraModeListener listener : mConcurrentCameraModeListeners) {
                listener.onCameraOperatingModeUpdated(
                        mCameraOperatingMode,
                        cameraOperatingMode);
            }
        }

        mCameraOperatingMode = cameraOperatingMode;
    }

    @Override
    public void addListener(@NonNull ConcurrentCameraModeListener listener) {
        mConcurrentCameraModeListeners.add(listener);
    }

    @Override
    public void removeListener(@NonNull ConcurrentCameraModeListener listener) {
        mConcurrentCameraModeListeners.remove(listener);
    }

    @Override
    public void shutdown() {
        mConcurrentCameraIdMap.clear();
        mConcurrentCameraIds.clear();
        mConcurrentCameraSelectors.clear();
        mActiveConcurrentCameraInfos.clear();
        mConcurrentCameraModeListeners.clear();
    }

    public int getCameraUpdateCount() {
        return mCameraUpdateCount;
    }

    @Override
    public void onCamerasUpdated(@NonNull List<String> cameraIds) throws
            CameraUpdateException {
        mCameraUpdateCount++;
        if (mShouldThrow) {
            throw new CameraUpdateException("Test failure");
        }
    }

    public void setCamerasUpdateShouldThrow(boolean shouldThrow) {
        mShouldThrow = shouldThrow;
    }
}
