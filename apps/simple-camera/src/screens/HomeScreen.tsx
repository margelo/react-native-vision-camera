import Ionicons, {
  type IoniconsIconName,
} from '@react-native-vector-icons/ionicons'
import { useNavigation } from '@react-navigation/native'
import type React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaPadding } from '../hooks/useSafeAreaPadding'
import { previewLabColors as colors } from '../theme/previewLabTheme'

interface DemoCardProps {
  description: string
  featured?: boolean
  icon: IoniconsIconName
  label: string
  onPress: () => void
  title: string
}

function DemoCard({
  description,
  featured = false,
  icon,
  label,
  onPress,
  title,
}: DemoCardProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        featured && styles.featuredCard,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.iconContainer, featured && styles.featuredIcon]}>
        <Ionicons color={colors.primary} name={icon} size={26} />
      </View>
      <View style={styles.cardCopy}>
        <Text style={styles.cardLabel}>{label}</Text>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
      <Ionicons color={colors.textSubtle} name="chevron-forward" size={22} />
    </Pressable>
  )
}

export function HomeScreen(): React.ReactElement {
  const navigation = useNavigation()
  const safePadding = useSafeAreaPadding(16)

  return (
    <ScrollView
      contentContainerStyle={[styles.container, safePadding]}
      style={styles.screen}
    >
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Ionicons
              color={colors.primaryInk}
              name="aperture-outline"
              size={18}
            />
          </View>
          <Text style={styles.eyebrow}>VISION CAMERA / EXAMPLES</Text>
        </View>
        <Text style={styles.title}>Choose a demo</Text>
        <Text style={styles.subtitle}>
          Explore the camera API and build layouts that follow the live preview.
        </Text>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionLabel}>EXPLORE</Text>
        <View style={styles.sectionLine} />
      </View>
      <View style={styles.cards}>
        <DemoCard
          description="See how upright resolution keeps controls and picture-in-picture aligned."
          featured
          icon="scan-outline"
          label="NEW · PREVIEW API"
          onPress={() => navigation.navigate('PreviewLab')}
          title="Preview Lab"
        />
        <DemoCard
          description="Capture photos and exercise the complete camera setup."
          icon="camera-outline"
          label="CAPTURE"
          onPress={() => navigation.navigate('Camera')}
          title="Camera"
        />
      </View>
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
  header: {
    marginTop: 42,
    marginBottom: 34,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: 10,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.7,
  },
  title: {
    color: colors.text,
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1.2,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 420,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  sectionLabel: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  sectionLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  cards: {
    gap: 14,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 18,
  },
  featuredCard: {
    borderColor: colors.primaryBorder,
  },
  cardPressed: {
    backgroundColor: colors.surfacePressed,
    transform: [{ scale: 0.99 }],
  },
  iconContainer: {
    alignItems: 'center',
    backgroundColor: colors.primaryWash,
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  featuredIcon: {
    borderColor: colors.primaryBorder,
    borderWidth: 1,
  },
  cardCopy: {
    flex: 1,
    marginHorizontal: 16,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardLabel: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  cardDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
})
