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

import androidx.camera.core.impl.EncoderProfilesProvider;
import androidx.camera.core.impl.EncoderProfilesProxy;

import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

import java.util.HashMap;
import java.util.Map;

/**
 * A fake implementation of the {@link EncoderProfilesProvider} and used for test.
 */
public class FakeEncoderProfilesProvider implements EncoderProfilesProvider {

    private final Map<Integer, EncoderProfilesProxy> mQualityToProfileMap;

    FakeEncoderProfilesProvider(@NonNull Map<Integer, EncoderProfilesProxy> qualityToProfileMap) {
        mQualityToProfileMap = qualityToProfileMap;
    }

    /** {@inheritDoc} */
    @Override
    public boolean hasProfile(int quality) {
        return mQualityToProfileMap.get(quality) != null;
    }

    /** {@inheritDoc} */
    @Override
    public @Nullable EncoderProfilesProxy getAll(int quality) {
        return mQualityToProfileMap.get(quality);
    }

    /**
     * The builder to create a FakeEncoderProfilesProvider instance.
     */
    public static class Builder {

        private final Map<Integer, EncoderProfilesProxy> mQualityToProfileMap = new HashMap<>();

        /**
         * Adds a quality and its corresponding profiles.
         */
        public @NonNull Builder add(int quality, @NonNull EncoderProfilesProxy profiles) {
            mQualityToProfileMap.put(quality, profiles);
            return this;
        }

        /**
         * Adds qualities and their corresponding profiles.
         */
        public @NonNull Builder addAll(
                @NonNull Map<Integer, EncoderProfilesProxy> qualityToProfileMap) {
            mQualityToProfileMap.putAll(qualityToProfileMap);
            return this;
        }

        /** Builds the FakeEncoderProfilesProvider instance. */
        public @NonNull FakeEncoderProfilesProvider build() {
            return new FakeEncoderProfilesProvider(mQualityToProfileMap);
        }
    }
}
