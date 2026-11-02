import Ionicons from '@react-native-vector-icons/ionicons'
import { useNavigation } from '@react-navigation/native'
import type React from 'react'
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera'
import { useSafeAreaPadding } from '../hooks/useSafeAreaPadding'
import { previewLabColors as colors } from '../theme/previewLabTheme'

export function PermissionsScreen(): React.ReactElement {
  const navigation = useNavigation()
  const safePadding = useSafeAreaPadding(24)
  const cameraPermission = useCameraPermission()
  const microphonePermission = useMicrophonePermission()

  useEffect(() => {
    if (cameraPermission.hasPermission) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      })
    }
  }, [cameraPermission.hasPermission, navigation])

  return (
    <View style={[styles.container, safePadding]}>
      <View style={styles.content}>
        <View style={styles.mark}>
          <Ionicons
            color={colors.primaryInk}
            name="aperture-outline"
            size={30}
          />
        </View>
        <Text style={styles.eyebrow}>VISION CAMERA</Text>
        <Text style={styles.title}>Start with the camera.</Text>
        <Text style={styles.description}>
          Allow camera access to explore live previews, adaptive layouts, and
          capture. Microphone access enables video recording.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            cameraPermission.requestPermission()
            microphonePermission.requestPermission()
          }}
          style={({ pressed }) => [
            styles.grantButton,
            pressed && styles.grantButtonPressed,
          ]}
        >
          <Text style={styles.grantButtonText}>Continue</Text>
          <Ionicons color={colors.primaryInk} name="arrow-forward" size={20} />
        </Pressable>
        <Text style={styles.note}>
          You can change camera and microphone access in system settings.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    alignSelf: 'center',
    maxWidth: 420,
    width: '100%',
  },
  mark: {
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: 18,
    height: 60,
    justifyContent: 'center',
    marginBottom: 28,
    width: 60,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 42,
  },
  description: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
  },
  grantButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    paddingHorizontal: 20,
    paddingVertical: 17,
  },
  grantButtonPressed: {
    opacity: 0.85,
  },
  grantButtonText: {
    color: colors.primaryInk,
    fontSize: 16,
    fontWeight: '700',
  },
  note: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18,
  },
})
