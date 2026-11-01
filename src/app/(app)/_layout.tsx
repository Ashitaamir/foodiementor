import { Stack } from 'expo-router';

import { colors } from '@/constants/fm-theme';

// Screens for signed-in users
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.blush } }}
    />
  );
}
