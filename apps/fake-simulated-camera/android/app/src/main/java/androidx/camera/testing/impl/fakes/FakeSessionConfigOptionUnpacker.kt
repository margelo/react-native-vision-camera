/*
 * Copyright 2024 The Android Open Source Project
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

package androidx.camera.testing.impl.fakes

import android.util.Size
import androidx.camera.core.impl.Config
import androidx.camera.core.impl.OptionsBundle
import androidx.camera.core.impl.SessionConfig
import androidx.camera.core.impl.UseCaseConfig

public class FakeSessionConfigOptionUnpacker : SessionConfig.OptionUnpacker {
    override fun unpack(
        resolution: Size,
        config: UseCaseConfig<*>,
        builder: SessionConfig.Builder,
    ) {
        val defaultSessionConfig = config.getDefaultSessionConfig(/* valueIfMissing= */ null)

        var implOptions: Config = OptionsBundle.emptyBundle()
        var templateType = SessionConfig.defaultEmptySessionConfig().templateType

        // Apply/extract defaults from session config
        if (defaultSessionConfig != null) {
            templateType = defaultSessionConfig.templateType
            builder.addAllDeviceStateCallbacks(defaultSessionConfig.deviceStateCallbacks)
            builder.addAllSessionStateCallbacks(defaultSessionConfig.sessionStateCallbacks)
            builder.addAllRepeatingCameraCaptureCallbacks(
                defaultSessionConfig.repeatingCameraCaptureCallbacks
            )
            implOptions = defaultSessionConfig.implementationOptions
        }

        // Set any additional implementation options
        builder.setImplementationOptions(implOptions)

        // TODO: Set the WYSIWYG preview for CAPTURE_TYPE_PREVIEW
        // TODO: Get Camera2Interop extended options

        // Apply template type
        builder.setTemplateType(templateType)

        // TODO: Add extension callbacks

        builder.setPreviewStabilization(config.previewStabilizationMode)
        builder.setVideoStabilization(config.videoStabilizationMode)

        // TODO: Copy extended Camera2 configurations
        // TODO: Copy extension keys
    }
}
