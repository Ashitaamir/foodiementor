import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/fm-theme';

// Placeholder: the holo-card sign in / sign up screen replaces this in Step 2.
export default function SignInScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.titleBlock}>
        <Text style={styles.title} accessibilityRole="header">
          FoodieMentor
        </Text>
        <Text style={styles.tagline}>Track your meals the way you actually eat them</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.blush,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  titleBlock: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontFamily: fonts.pixel,
    fontSize: 18,
    color: colors.navy,
    textShadowColor: colors.cream,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  tagline: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.plum,
    textAlign: 'center',
  },
});
