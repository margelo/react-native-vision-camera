import Ionicons, {
  type IoniconsIconName,
} from '@react-native-vector-icons/ionicons'
import { useNavigation } from '@react-navigation/native'
import type React from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaPadding } from '../hooks/useSafeAreaPadding'
import { previewLabColors as colors } from '../theme/previewLabTheme'

interface LabCardProps {
  description: string
  icon: IoniconsIconName
  onPress?: () => void
  status?: string
  title: string
}

function LabCard({
  description,
  icon,
  onPress,
  status,
  title,
}: LabCardProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={onPress == null}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        onPress == null && styles.cardDisabled,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardIcon}>
        <Ionicons color={colors.primary} name={icon} size={24} />
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {status == null ? null : (
            <Text style={styles.cardStatus}>{status}</Text>
          )}
        </View>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
      {onPress == null ? null : (
        <Ionicons color={colors.textSubtle} name="chevron-forward" size={20} />
      )}
    </Pressable>
  )
}

export function PreviewLabScreen(): React.ReactElement {
  const navigation = useNavigation()
  const safePadding = useSafeAreaPadding(16)
  const supportsPreviewConfiguration =
    Platform.OS !== 'ios' || Number.parseInt(String(Platform.Version), 10) >= 17

  return (
    <ScrollView
      contentContainerStyle={[styles.container, safePadding]}
      style={styles.screen}
    >
      <View style={styles.navigationRow}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons color={colors.text} name="chevron-back" size={24} />
        </Pressable>
        <View>
          <Text style={styles.eyebrow}>SHOWCASES</Text>
          <Text style={styles.title}>Preview Lab</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Upright Preview resolution keeps camera layouts aligned as the device
        turns. Start with the dimensions, then see them drive controls and PiP.
      </Text>

      {supportsPreviewConfiguration ? (
        <>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionLabel}>CHOOSE AN EXPERIMENT</Text>
            <Text style={styles.sectionCount}>03 DEMOS</Text>
          </View>
          <View style={styles.cards}>
            <LabCard
              description="See the upright dimensions and aspect ratio update beside the native stream values."
              icon="resize-outline"
              onPress={() => navigation.navigate('UprightPreview')}
              status="01"
              title="Upright resolution"
            />
            <LabCard
              description="Use the upright ratio to fit the frame and keep camera controls aligned with it."
              icon="options-outline"
              onPress={() => navigation.navigate('AdaptiveControls')}
              status="02"
              title="Adaptive controls"
            />
            <LabCard
              description="Resize and dock a live Preview while its frame follows the upright ratio."
              icon="albums-outline"
              onPress={() => navigation.navigate('PictureInPicture')}
              status="03"
              title="Picture-in-picture"
            />
          </View>
        </>
      ) : (
        <View style={styles.compatibilityCard}>
          <View style={styles.compatibilityIcon}>
            <Ionicons
              color={colors.primary}
              name="information-circle"
              size={28}
            />
          </View>
          <Text style={styles.compatibilityTitle}>iOS 17 required</Text>
          <Text style={styles.compatibilityDescription}>
            Preview Lab needs iOS 17 or newer to report the upright Preview
            resolution. Android is supported normally.
          </Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
  },
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    paddingBottom: 24,
  },
  navigationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 18,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    marginBottom: 3,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
    marginTop: 22,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLabel: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  sectionCount: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  cards: {
    gap: 12,
  },
  compatibilityCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 30,
  },
  compatibilityIcon: {
    alignItems: 'center',
    backgroundColor: colors.primaryWash,
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    marginBottom: 16,
    width: 52,
  },
  compatibilityTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  compatibilityDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 340,
    textAlign: 'center',
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 16,
  },
  cardDisabled: {
    opacity: 0.52,
  },
  cardPressed: {
    backgroundColor: colors.surfacePressed,
    transform: [{ scale: 0.99 }],
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: colors.primaryWash,
    borderRadius: 14,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  cardCopy: {
    flex: 1,
    marginHorizontal: 14,
  },
  cardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  cardStatus: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginLeft: 'auto',
  },
  cardDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
})
