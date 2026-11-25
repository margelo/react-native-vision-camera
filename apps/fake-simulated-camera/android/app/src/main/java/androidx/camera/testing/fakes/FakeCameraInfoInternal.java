/*
 * Copyright 2019 The Android Open Source Project
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
// Vendored from AOSP platform/frameworks/support@bb117e26ce89b888d6f928ff7b604913a1da43f2 (camera-core 1.7.0-alpha03), see THIRD_PARTY.md. Modified: no androidx.test/CameraManager dependency, catalog setters, UnsafeWrapper bridge.

package androidx.camera.testing.fakes;

import static androidx.camera.core.DynamicRange.SDR;

import android.graphics.Rect;
import android.util.Range;
import android.util.Rational;
import android.util.Size;
import android.view.Surface;

import androidx.annotation.FloatRange;
import androidx.camera.common.UnsafeWrapper;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.CameraState;
import androidx.camera.core.CameraUseCaseAdapterProvider;
import androidx.camera.core.DynamicRange;
import androidx.camera.core.ExposureState;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.Logger;
import androidx.camera.core.TorchState;
import androidx.camera.core.UseCase;
import androidx.camera.core.ZoomState;
import androidx.camera.core.impl.CameraCaptureCallback;
import androidx.camera.core.impl.CameraConfig;
import androidx.camera.core.impl.CameraExtensionCapabilities;
import androidx.camera.core.impl.CameraInfoInternal;
import androidx.camera.core.impl.DynamicRanges;
import androidx.camera.core.impl.EncoderProfilesProvider;
import androidx.camera.core.impl.ImageOutputConfig.RotationValue;
import androidx.camera.core.impl.Quirk;
import androidx.camera.core.impl.Quirks;
import androidx.camera.core.impl.Timebase;
import androidx.camera.core.impl.utils.CameraOrientationUtil;
import androidx.camera.core.internal.ImmutableZoomState;
import androidx.camera.core.internal.StreamSpecsCalculator;
import androidx.core.util.Preconditions;
import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;

import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executor;

/**
 * Information for a fake camera. Everything the catalog describes is pushed in through setters;
 * {@link #unwrapAs(Class)} exposes the Camera2 interop objects VisionCamera asks for.
 */
@SuppressWarnings("HiddenSuperclass")
public final class FakeCameraInfoInternal implements CameraInfoInternal, UnsafeWrapper {
    private static final String TAG = "FakeCameraInfoInternal";
    private static final Set<DynamicRange> DEFAULT_DYNAMIC_RANGES = Collections.singleton(SDR);

    /** Resolves the Camera2 interop objects (Camera2CameraInfo, CameraCharacteristics) for this camera. */
    public interface Unwrapper {
        <T> @Nullable T unwrapAs(@NonNull Class<T> type);
    }

    private final String mCameraId;
    private final int mSensorRotation;
    @CameraSelector.LensFacing
    private final int mLensFacing;
    private final MutableLiveData<Integer> mTorchState = new MutableLiveData<>(TorchState.OFF);
    private final MutableLiveData<ZoomState> mZoomLiveData;
    private final Map<Integer, List<Size>> mSupportedResolutionMap = new HashMap<>();
    private final Map<Range<Integer>, List<Size>> mSupportedHighSpeedFpsToSizeMap = new HashMap<>();
    private final Map<Integer, List<Size>> mSupportedHighResolutionMap = new HashMap<>();
    private MutableLiveData<CameraState> mCameraStateMutableLiveData;
    private final Set<DynamicRange> mSupportedDynamicRanges = new LinkedHashSet<>(DEFAULT_DYNAMIC_RANGES);
    private final Set<Integer> mAvailableCapabilities = new LinkedHashSet<>();
    private final Set<Integer> mSupportedExtensions = new LinkedHashSet<>();
    private final Map<Integer, CameraExtensionCapabilities> mExtensionCapabilitiesMap = new HashMap<>();
    private final Set<Range<Integer>> mSupportedFrameRateRanges = new LinkedHashSet<>();
    private String mImplementationType = IMPLEMENTATION_TYPE_FAKE;
    private EncoderProfilesProvider mEncoderProfilesProvider;
    private boolean mIsPrivateReprocessingSupported = false;
    private float mIntrinsicZoomRatio = 1.0F;
    private boolean mIsFocusMeteringSupported = false;
    private boolean mIsHighSpeedSupported = false;
    private boolean mIsPreviewStabilizationSupported = false;
    private boolean mIsVideoStabilizationSupported = false;
    private boolean mHasFlashUnit = true;
    private Rect mSensorRect = new Rect(0, 0, 4032, 3024);
    private ExposureState mExposureState = new FakeExposureState();
    private final @NonNull List<Quirk> mCameraQuirks = new ArrayList<>();
    private Timebase mTimebase = Timebase.UPTIME;
    private final @NonNull StreamSpecsCalculator mStreamSpecsCalculator;
    private @Nullable CameraUseCaseAdapterProvider mCameraUseCaseAdapterProvider;
    private @Nullable Object mCameraCharacteristics;
    private @Nullable Unwrapper mUnwrapper;

    public FakeCameraInfoInternal(@NonNull String cameraId) {
        this(cameraId, 0, CameraSelector.LENS_FACING_BACK,
                androidx.camera.core.internal.StreamSpecsCalculator.NO_OP_STREAM_SPECS_CALCULATOR);
    }

    public FakeCameraInfoInternal(@NonNull String cameraId, int sensorRotation,
            @CameraSelector.LensFacing int lensFacing,
            @NonNull StreamSpecsCalculator streamSpecsCalculator) {
        mCameraId = cameraId;
        mSensorRotation = sensorRotation;
        mLensFacing = lensFacing;
        mZoomLiveData = new MutableLiveData<>(ImmutableZoomState.create(1.0f, 4.0f, 1.0f, 0.0f));
        mStreamSpecsCalculator = streamSpecsCalculator;
        mSupportedFrameRateRanges.add(new Range<>(30, 30));
    }

    public void setZoom(float zoomRatio, float minZoomRatio, float maxZoomRatio, float linearZoom) {
        mZoomLiveData.postValue(ImmutableZoomState.create(zoomRatio, maxZoomRatio, minZoomRatio, linearZoom));
    }

    public void setExposureState(int index, @NonNull Range<Integer> range,
            @NonNull Rational step, boolean isSupported) {
        mExposureState = new FakeExposureState(index, range, step, isSupported);
    }

    public void setTorch(int torchState) {
        mTorchState.postValue(torchState);
    }

    public void setIsFocusMeteringSupported(boolean supported) {
        mIsFocusMeteringSupported = supported;
    }

    public void setIsPreviewStabilizationSupported(boolean supported) {
        mIsPreviewStabilizationSupported = supported;
    }

    public void setVideoStabilizationSupported(boolean supported) {
        mIsVideoStabilizationSupported = supported;
    }

    public void setHasFlashUnit(boolean hasFlashUnit) {
        mHasFlashUnit = hasFlashUnit;
    }

    public void setSensorRect(@NonNull Rect sensorRect) {
        mSensorRect = sensorRect;
    }

    public void setSupportedFrameRateRanges(@NonNull Set<Range<Integer>> ranges) {
        mSupportedFrameRateRanges.clear();
        mSupportedFrameRateRanges.addAll(ranges);
    }

    public void setCameraCharacteristics(@Nullable Object cameraCharacteristics) {
        mCameraCharacteristics = cameraCharacteristics;
    }

    public void setUnwrapper(@Nullable Unwrapper unwrapper) {
        mUnwrapper = unwrapper;
    }

    @Override
    public <T> @Nullable T unwrapAs(@NonNull Class<T> type) {
        return mUnwrapper == null ? null : mUnwrapper.unwrapAs(type);
    }

    @Override
    public int getLensFacing() {
        return mLensFacing;
    }

    @Override
    public @NonNull String getCameraId() {
        return mCameraId;
    }

    @Override
    public int getSensorRotationDegrees(@RotationValue int relativeRotation) {
        int relativeRotationDegrees = CameraOrientationUtil.surfaceRotationToDegrees(relativeRotation);
        boolean isOppositeFacingScreen = CameraSelector.LENS_FACING_BACK == getLensFacing();
        return CameraOrientationUtil.getRelativeImageRotation(relativeRotationDegrees, mSensorRotation, isOppositeFacingScreen);
    }

    @Override
    public int getSensorRotationDegrees() {
        return getSensorRotationDegrees(Surface.ROTATION_0);
    }

    @Override
    public boolean hasFlashUnit() {
        return mHasFlashUnit;
    }

    @Override
    public @NonNull LiveData<Integer> getTorchState() {
        return mTorchState;
    }

    @Override
    public @NonNull LiveData<ZoomState> getZoomState() {
        return mZoomLiveData;
    }

    @Override
    public @NonNull ExposureState getExposureState() {
        return mExposureState;
    }

    private MutableLiveData<CameraState> getCameraStateMutableLiveData() {
        if (mCameraStateMutableLiveData == null) {
            mCameraStateMutableLiveData = new MutableLiveData<>(CameraState.create(CameraState.Type.CLOSED));
        }
        return mCameraStateMutableLiveData;
    }

    @Override
    public @NonNull LiveData<CameraState> getCameraState() {
        return getCameraStateMutableLiveData();
    }

    @Override
    public @NonNull String getImplementationType() {
        return mImplementationType;
    }

    @Override
    public @NonNull EncoderProfilesProvider getEncoderProfilesProvider() {
        return mEncoderProfilesProvider == null ? EncoderProfilesProvider.EMPTY : mEncoderProfilesProvider;
    }

    @Override
    public @NonNull Timebase getTimebase() {
        return mTimebase;
    }

    @Override
    public @NonNull Set<Integer> getSupportedOutputFormats() {
        return mSupportedResolutionMap.keySet();
    }

    @Override
    public @NonNull List<Size> getSupportedResolutions(int format) {
        List<Size> resolutions = mSupportedResolutionMap.get(format);
        return resolutions != null ? resolutions : Collections.emptyList();
    }

    @Override
    public @NonNull List<Size> getSupportedHighResolutions(int format) {
        List<Size> resolutions = mSupportedHighResolutionMap.get(format);
        return resolutions != null ? resolutions : Collections.emptyList();
    }

    @Override
    public @NonNull Set<DynamicRange> getSupportedDynamicRanges() {
        return mSupportedDynamicRanges;
    }

    @Override
    public boolean isHighSpeedSupported() {
        return mIsHighSpeedSupported;
    }

    @Override
    public @NonNull Set<Range<Integer>> getSupportedHighSpeedFrameRateRanges() {
        return mSupportedHighSpeedFpsToSizeMap.keySet();
    }

    @Override
    public @NonNull Set<Range<Integer>> getSupportedHighSpeedFrameRateRangesFor(@NonNull Size size) {
        Set<Range<Integer>> ranges = new LinkedHashSet<>();
        for (Map.Entry<Range<Integer>, List<Size>> entry : mSupportedHighSpeedFpsToSizeMap.entrySet()) {
            if (entry.getValue().contains(size)) {
                ranges.add(entry.getKey());
            }
        }
        return ranges;
    }

    @Override
    public @NonNull List<Size> getSupportedHighSpeedResolutions() {
        Set<Size> resolutions = new LinkedHashSet<>();
        for (List<Size> sizes : mSupportedHighSpeedFpsToSizeMap.values()) {
            resolutions.addAll(sizes);
        }
        return new ArrayList<>(resolutions);
    }

    @Override
    public @NonNull List<Size> getSupportedHighSpeedResolutionsFor(@NonNull Range<Integer> fpsRange) {
        List<Size> resolutions = mSupportedHighSpeedFpsToSizeMap.get(fpsRange);
        return resolutions != null ? resolutions : Collections.emptyList();
    }

    @Override
    public @NonNull Rect getSensorRect() {
        return mSensorRect;
    }

    @Override
    public @NonNull Set<DynamicRange> querySupportedDynamicRanges(@NonNull Set<DynamicRange> candidateDynamicRanges) {
        return DynamicRanges.findAllPossibleMatches(candidateDynamicRanges, getSupportedDynamicRanges());
    }

    @Override
    public void addSessionCaptureCallback(@NonNull Executor executor, @NonNull CameraCaptureCallback callback) {
    }

    @Override
    public void removeSessionCaptureCallback(@NonNull CameraCaptureCallback callback) {
    }

    @Override
    public @NonNull Quirks getCameraQuirks() {
        return new Quirks(mCameraQuirks);
    }

    @Override
    public @NonNull Set<Range<Integer>> getSupportedFrameRateRanges() {
        return Collections.unmodifiableSet(mSupportedFrameRateRanges);
    }

    @Override
    public boolean isFocusMeteringSupported(@NonNull FocusMeteringAction action) {
        return mIsFocusMeteringSupported;
    }

    @androidx.camera.core.ExperimentalZeroShutterLag
    @Override
    public boolean isZslSupported() {
        return false;
    }

    @Override
    public boolean isPrivateReprocessingSupported() {
        return mIsPrivateReprocessingSupported;
    }

    @FloatRange(from = 0, fromInclusive = false)
    @Override
    public float getIntrinsicZoomRatio() {
        return mIntrinsicZoomRatio;
    }

    @Override
    public boolean isPreviewStabilizationSupported() {
        return mIsPreviewStabilizationSupported;
    }

    @Override
    public boolean isVideoStabilizationSupported() {
        return mIsVideoStabilizationSupported;
    }

    public void addCameraQuirk(final @NonNull Quirk quirk) {
        mCameraQuirks.add(quirk);
    }

    public void updateCameraState(@NonNull CameraState cameraState) {
        getCameraStateMutableLiveData().postValue(cameraState);
    }

    public void setImplementationType(@ImplementationType @NonNull String implementationType) {
        mImplementationType = implementationType;
    }

    public void setEncoderProfilesProvider(@NonNull EncoderProfilesProvider encoderProfilesProvider) {
        mEncoderProfilesProvider = Preconditions.checkNotNull(encoderProfilesProvider);
    }

    public void setTimebase(@NonNull Timebase timebase) {
        mTimebase = timebase;
    }

    public void setSupportedResolutions(int format, @NonNull List<Size> resolutions) {
        mSupportedResolutionMap.put(format, resolutions);
    }

    public void setSupportedHighResolutions(int format, @NonNull List<Size> resolutions) {
        mSupportedHighResolutionMap.put(format, resolutions);
    }

    public void setHighSpeedSupported(boolean supported) {
        mIsHighSpeedSupported = supported;
    }

    public void setSupportedHighSpeedResolutions(@NonNull Range<Integer> fps, @NonNull List<Size> resolutions) {
        mSupportedHighSpeedFpsToSizeMap.put(fps, resolutions);
    }

    public void setPrivateReprocessingSupported(boolean supported) {
        mIsPrivateReprocessingSupported = supported;
    }

    public void setIntrinsicZoomRatio(float zoomRatio) {
        mIntrinsicZoomRatio = zoomRatio;
    }

    public void setSupportedDynamicRanges(@NonNull Set<DynamicRange> dynamicRanges) {
        mSupportedDynamicRanges.clear();
        mSupportedDynamicRanges.addAll(dynamicRanges);
    }

    @Override
    public @NonNull Object getCameraCharacteristics() {
        if (mCameraCharacteristics == null) {
            throw new IllegalStateException("FakeCameraInfoInternal " + mCameraId + " has no CameraCharacteristics");
        }
        return mCameraCharacteristics;
    }

    @Override
    public @Nullable Object getPhysicalCameraCharacteristics(@NonNull String physicalCameraId) {
        return null;
    }

    @Override
    public boolean isUseCaseCombinationSupported(@NonNull List<@NonNull UseCase> useCases,
            int cameraMode, boolean isFeatureComboInvocation, @NonNull CameraConfig cameraConfig) {
        try {
            StreamSpecsCalculator.Companion.calculateSuggestedStreamSpecsCompat(
                    mStreamSpecsCalculator, cameraMode, this, useCases, cameraConfig, isFeatureComboInvocation);
        } catch (IllegalArgumentException e) {
            Logger.d(TAG, "isUseCaseCombinationSupported: calculateSuggestedStreamSpecs failed", e);
            return false;
        }
        return true;
    }

    @Override
    public void setCameraUseCaseAdapterProvider(@NonNull CameraUseCaseAdapterProvider cameraUseCaseAdapterProvider) {
        CameraInfoInternal.super.setCameraUseCaseAdapterProvider(cameraUseCaseAdapterProvider);
        mCameraUseCaseAdapterProvider = cameraUseCaseAdapterProvider;
    }

    public @Nullable CameraUseCaseAdapterProvider getCameraUseCaseAdapterProvider() {
        return mCameraUseCaseAdapterProvider;
    }

    @Override
    public @NonNull Set<@NonNull Integer> getAvailableCapabilities() {
        return new LinkedHashSet<>(mAvailableCapabilities);
    }

    public void setAvailableCapabilities(@NonNull Set<@NonNull Integer> availableCapabilities) {
        mAvailableCapabilities.clear();
        mAvailableCapabilities.addAll(availableCapabilities);
    }

    public void setSupportedExtensions(@NonNull Set<Integer> supportedExtensions) {
        mSupportedExtensions.clear();
        mSupportedExtensions.addAll(supportedExtensions);
    }

    public void setCameraExtensionCapabilities(int extensionMode, @Nullable CameraExtensionCapabilities capabilities) {
        mExtensionCapabilitiesMap.put(extensionMode, capabilities);
    }

    @Override
    public @NonNull Set<Integer> getSupportedExtensions() {
        return new LinkedHashSet<>(mSupportedExtensions);
    }

    @Override
    public @Nullable CameraExtensionCapabilities getCameraExtensionCapabilities(int extensionMode) {
        return mExtensionCapabilitiesMap.get(extensionMode);
    }

    static final class FakeExposureState implements ExposureState {
        private int mIndex = 0;
        private Range<Integer> mRange = new Range<>(0, 0);
        private Rational mStep = Rational.ZERO;
        private boolean mIsSupported = true;

        FakeExposureState() {
        }

        FakeExposureState(int index, Range<Integer> range, Rational step, boolean isSupported) {
            mIndex = index;
            mRange = range;
            mStep = step;
            mIsSupported = isSupported;
        }

        @Override
        public int getExposureCompensationIndex() {
            return mIndex;
        }

        @Override
        public @NonNull Range<Integer> getExposureCompensationRange() {
            return mRange;
        }

        @Override
        public @NonNull Rational getExposureCompensationStep() {
            return mStep;
        }

        @Override
        public boolean isExposureCompensationSupported() {
            return mIsSupported;
        }
    }
}
