import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/fm-theme';

// Back button and a pixel title, for screens opened on top of the tabs
export function ScreenHeader({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.backButton}>
        <Text style={styles.backText}>{'<'}</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  backText: { fontFamily: fonts.pixel, fontSize: 14, color: colors.navy },
  title: { fontFamily: fonts.pixel, fontSize: 13, color: colors.navy },
});
