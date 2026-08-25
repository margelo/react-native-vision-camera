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

import static android.graphics.ImageFormat.JPEG;
import static android.graphics.ImageFormat.YUV_420_888;

import static androidx.camera.core.impl.ImageFormatConstants.INTERNAL_DEFINED_IMAGE_FORMAT_PRIVATE;


import android.util.Size;

import androidx.camera.core.Logger;
import androidx.camera.core.impl.AttachedSurfaceInfo;
import androidx.camera.core.impl.CameraDeviceSurfaceManager;
import androidx.camera.core.impl.CameraMode;
import androidx.camera.core.impl.ImageAnalysisConfig;
import androidx.camera.core.impl.ImageCaptureConfig;
import androidx.camera.core.impl.PreviewConfig;
import androidx.camera.core.impl.StreamSpec;
import androidx.camera.core.impl.StreamUseCase;
import androidx.camera.core.impl.SurfaceConfig;
import androidx.camera.core.impl.SurfaceStreamSpecQueryResult;
import androidx.camera.core.impl.UseCaseConfig;
import androidx.camera.core.impl.UseCaseConfigFactory;
import androidx.camera.core.impl.stabilization.VideoStabilization;
import androidx.camera.core.streamsharing.StreamSharingConfig;
import androidx.camera.video.impl.VideoCaptureConfig;

import org.jspecify.annotations.NonNull;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** A CameraDeviceSurfaceManager which has no supported SurfaceConfigs. */
public final class FakeCameraDeviceSurfaceManager implements CameraDeviceSurfaceManager {
    private static final String TAG = "FakeCameraDeviceSurfaceManager";

    public static final Size MAX_OUTPUT_SIZE = new Size(4032, 3024); // 12.2 MP
    public static final int MAX_SUPPORTED_FRAME_RATE = 60;

    private final Map<String, Map<Class<? extends UseCaseConfig<?>>, StreamSpec>>
            mDefinedStreamSpecs = new HashMap<>();

    private Set<List<Integer>> mValidSurfaceCombos = createDefaultValidSurfaceCombos();
    private int mCameraUpdateCount = 0;

    /**
     * Sets the given suggested stream specs for the specified camera Id and use case type.
     */
    public void setSuggestedStreamSpec(@NonNull String cameraId,
            @NonNull Class<? extends UseCaseConfig<?>> type,
            @NonNull StreamSpec streamSpec) {
        Map<Class<? extends UseCaseConfig<?>>, StreamSpec> useCaseConfigTypeToStreamSpecMap =
                mDefinedStreamSpecs.get(cameraId);
        if (useCaseConfigTypeToStreamSpecMap == null) {
            useCaseConfigTypeToStreamSpecMap = new HashMap<>();
            mDefinedStreamSpecs.put(cameraId, useCaseConfigTypeToStreamSpecMap);
        }

        useCaseConfigTypeToStreamSpecMap.put(type, streamSpec);
    }

    @Override
    public @NonNull SurfaceConfig transformSurfaceConfig(
            @CameraMode.Mode int cameraMode,
            @NonNull String cameraId,
            int imageFormat,
            @NonNull Size size,
            @NonNull StreamUseCase streamUseCase) {

        //returns a placeholder SurfaceConfig
        return SurfaceConfig.create(SurfaceConfig.ConfigType.PRIV,
                SurfaceConfig.ConfigSize.PREVIEW, streamUseCase);
    }

    @Override
    public @NonNull SurfaceStreamSpecQueryResult getSuggestedStreamSpecs(
            @CameraMode.Mode int cameraMode,
            @NonNull String cameraId,
            @NonNull List<AttachedSurfaceInfo> existingSurfaces,
            @NonNull Map<UseCaseConfig<?>, List<Size>> newUseCaseConfigsSupportedSizeMap,
            @NonNull VideoStabilization videoStabilization,
            boolean hasVideoCapture, boolean isFeatureComboInvocation,
            boolean findMaxSupportedFrameRate) {
        List<UseCaseConfig<?>> newUseCaseConfigs =
                new ArrayList<>(newUseCaseConfigsSupportedSizeMap.keySet());
        checkSurfaceCombo(existingSurfaces, newUseCaseConfigs);

        // Populate the suggested stream specs for new use cases.
        Map<UseCaseConfig<?>, StreamSpec> suggestedStreamSpecs = new HashMap<>();
        for (UseCaseConfig<?> useCaseConfig : newUseCaseConfigs) {
            // MODIFIED (fake-simulated-camera): pick a size the camera actually supports for this use case,
            // instead of the hardcoded MAX_OUTPUT_SIZE — otherwise CameraX rejects the (unsupported) 4032x3024.
            StreamSpec spec = getStreamSpec(cameraId, useCaseConfig.getClass(), hasVideoCapture);
            List<Size> supportedSizes = newUseCaseConfigsSupportedSizeMap.get(useCaseConfig);
            if (supportedSizes != null && !supportedSizes.isEmpty()
                    && (mDefinedStreamSpecs.get(cameraId) == null
                        || mDefinedStreamSpecs.get(cameraId).get(useCaseConfig.getClass()) == null)) {
                spec = StreamSpec.builder(largestWithin(supportedSizes)).setZslDisabled(hasVideoCapture).build();
            }
            suggestedStreamSpecs.put(useCaseConfig, spec);
        }

        // Populate the stream specs for existing use cases.
        Map<AttachedSurfaceInfo, StreamSpec> existingStreamSpecs = new HashMap<>();
        for (AttachedSurfaceInfo attachedSurfaceInfo : existingSurfaces) {
            existingStreamSpecs.put(attachedSurfaceInfo, getStreamSpec(cameraId,
                    captureTypeToUseCaseConfigType(attachedSurfaceInfo.getCaptureTypes().get(0)),
                    hasVideoCapture));
        }

        return new SurfaceStreamSpecQueryResult(suggestedStreamSpecs, existingStreamSpecs,
                MAX_SUPPORTED_FRAME_RATE);
    }

    // MODIFIED (fake-simulated-camera): largest supported size not exceeding ANALYSIS_MAX_SIZE. ImageAnalysis
    // (VisionCamera's frame + barcode outputs) rejects streams above ~1080p, so cap there rather than at the
    // sensor's full resolution.
    private static final Size ANALYSIS_MAX_SIZE = new Size(1920, 1080);

    private static @NonNull Size largestWithin(@NonNull List<Size> sizes) {
        Size best = null;
        for (Size size : sizes) {
            long area = (long) size.getWidth() * size.getHeight();
            if (area > (long) ANALYSIS_MAX_SIZE.getWidth() * ANALYSIS_MAX_SIZE.getHeight()) {
                continue;
            }
            if (best == null || area > (long) best.getWidth() * best.getHeight()) {
                best = size;
            }
        }
        if (best != null) {
            return best;
        }
        // No size within the cap: fall back to the smallest available.
        Size smallest = sizes.get(0);
        for (Size size : sizes) {
            if ((long) size.getWidth() * size.getHeight()
                    < (long) smallest.getWidth() * smallest.getHeight()) {
                smallest = size;
            }
        }
        return smallest;
    }

    private @NonNull StreamSpec getStreamSpec(@NonNull String cameraId, @NonNull Class<?> classType,
            boolean hasVideoCapture) {
        StreamSpec streamSpec = StreamSpec.builder(MAX_OUTPUT_SIZE)
                .setZslDisabled(hasVideoCapture)
                .build();
        Map<Class<? extends UseCaseConfig<?>>, StreamSpec> definedStreamSpecs =
                mDefinedStreamSpecs.get(cameraId);
        if (definedStreamSpecs != null) {
            StreamSpec definedStreamSpec = definedStreamSpecs.get(classType);
            if (definedStreamSpec != null) {
                streamSpec = definedStreamSpec;
            }
        }
        return streamSpec;
    }

    /**
     * Returns the {@link UseCaseConfig} type from a
     * {@link androidx.camera.core.impl.UseCaseConfigFactory.CaptureType}.
     */
    private Class<?> captureTypeToUseCaseConfigType(
            UseCaseConfigFactory.@NonNull CaptureType captureType) {
        switch (captureType) {
            case METERING_REPEATING:
                // Fall-through
            case PREVIEW:
                return PreviewConfig.class;
            case IMAGE_CAPTURE:
                return ImageCaptureConfig.class;
            case IMAGE_ANALYSIS:
                return ImageAnalysisConfig.class;
            case VIDEO_CAPTURE:
                return VideoCaptureConfig.class;
            case STREAM_SHARING:
                return StreamSharingConfig.class;
            default:
                throw new IllegalArgumentException("Invalid capture type.");
        }
    }

    /**
     * Checks if the surface combinations is supported.
     *
     * <p> Throws {@link IllegalArgumentException} if not supported.
     */
    private void checkSurfaceCombo(List<AttachedSurfaceInfo> existingSurfaceInfos,
            @NonNull List<UseCaseConfig<?>> newSurfaceConfigs) {
        // Combine existing Surface with new Surface
        List<Integer> currentCombo = new ArrayList<>();
        for (UseCaseConfig<?> useCaseConfig : newSurfaceConfigs) {
            currentCombo.add(useCaseConfig.getInputFormat());
        }
        for (AttachedSurfaceInfo surfaceInfo : existingSurfaceInfos) {
            currentCombo.add(surfaceInfo.getImageFormat());
        }

        Logger.d(TAG,
                "checkSurfaceCombo: currentCombo = " + currentCombo + ", mValidSurfaceCombos = "
                        + mValidSurfaceCombos);

        // Loop through valid combinations and return early if the combo is supported.
        for (List<Integer> validCombo : mValidSurfaceCombos) {
            if (isComboSupported(currentCombo, validCombo)) {
                return;
            }
        }
        // Throw IAE if none of the valid combos supports the current combo.
        throw new IllegalArgumentException("Surface combo not supported");
    }

    /**
     * Checks if the app combination in covered by the given valid combination.
     */
    private boolean isComboSupported(@NonNull List<Integer> appCombo,
            @NonNull List<Integer> validCombo) {
        List<Integer> combo = new ArrayList<>(validCombo);
        for (Integer format : appCombo) {
            if (!combo.remove(format)) {
                return false;
            }
        }
        return true;
    }

    /**
     * The default combination is similar to LEGACY level devices.
     */
    private static Set<List<Integer>> createDefaultValidSurfaceCombos() {
        Set<List<Integer>> validCombos = new HashSet<>();
        validCombos.add(Arrays.asList(INTERNAL_DEFINED_IMAGE_FORMAT_PRIVATE, YUV_420_888, JPEG));
        validCombos.add(Arrays.asList(INTERNAL_DEFINED_IMAGE_FORMAT_PRIVATE,
                INTERNAL_DEFINED_IMAGE_FORMAT_PRIVATE));
        return validCombos;
    }

    public void setValidSurfaceCombos(@NonNull Set<List<Integer>> validSurfaceCombos) {
        mValidSurfaceCombos = validSurfaceCombos;
    }

    /** Adds a valid surface combo. */
    public void addValidSurfaceCombo(@NonNull List<Integer> validSurfaceCombo) {
        mValidSurfaceCombos.add(validSurfaceCombo);
    }

    @Override
    public void onCamerasUpdated(@NonNull List<String> cameraIds) {
        mCameraUpdateCount++;
    }

    public int getCameraUpdateCount() {
        return mCameraUpdateCount;
    }
}
