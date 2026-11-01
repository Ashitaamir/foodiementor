import { router, type Href } from 'expo-router';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/fm-theme';
import { supabase } from '@/lib/supabase';

const ITEMS: { label: string; hint: string; href?: Href }[] = [
  { label: 'Settings', hint: 'Goals and workouts', href: '/settings' },
  { label: 'Retake survey', hint: 'Update your weight, activity or goal', href: '/setup' },
  { label: 'Themes', hint: 'Colorful or dark', href: '/themes' },
  { label: 'Account', hint: 'Email and sign out', href: '/account' },
  { label: 'Sign up / Sign in', hint: 'Back to the start screen' },
];

// The start screen is only for signed-out players, so going back there means
// signing out first (the app then opens sign-in by itself)
function backToStart() {
  Alert.alert(
    'Back to the start screen?',
    "You'll be signed out, then you can sign in or create a new account.",
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Go', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ],
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
};

// The little pixel menu that drops down when you tap Lilo on Home
export function LiloMenu({ open, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close menu" style={styles.backdrop} onPress={onClose}>
        <View style={[styles.menu, { marginTop: insets.top + 70 }]} accessibilityRole="menu">
          {ITEMS.map((item, index) => (
            <Pressable
              key={item.label}
              accessibilityRole="menuitem"
              accessibilityHint={item.hint}
              onPress={() => {
                onClose();
                if (item.href) router.push(item.href);
                else backToStart();
              }}
              style={({ pressed }) => [
                styles.item,
                index < ITEMS.length - 1 && styles.itemDivider,
                pressed && styles.itemPressed,
              ]}>
              <Text style={styles.itemLabel}>{item.label.toUpperCase()}</Text>
              <Text style={styles.itemHint}>{item.hint}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    paddingHorizontal: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  menu: {
    width: 230,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `5px 5px 0 ${colors.navy}`,
  },
  item: {
    minHeight: 56,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  itemDivider: {
    borderBottomWidth: 2,
    borderBottomColor: colors.fieldLine,
  },
  itemPressed: {
    backgroundColor: colors.background,
  },
  itemLabel: { fontFamily: fonts.pixel, fontSize: 10, color: colors.navy },
  itemHint: { fontFamily: fonts.body, fontSize: 13, color: colors.plum },
});
