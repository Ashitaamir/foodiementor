import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PixelArt, toPixelRows } from '@/components/pixel-art';
import { colors, fonts } from '@/constants/fm-theme';

// 8 x 8 pixel icons for the tab bar (O = filled pixel)
const ICONS: Record<string, string[]> = {
  index: ['...OO...', '..OOOO..', '.OOOOOO.', 'OOOOOOOO', '.OO..OO.', '.OO..OO.', '.OO..OO.', '.OOOOOO.'],
  workout: ['........', 'OO....OO', 'OO....OO', 'OOOOOOOO', 'OOOOOOOO', 'OO....OO', 'OO....OO', '........'],
  recipes: ['OOOOOOO.', 'O.....OO', 'O.OOO.OO', 'O.....OO', 'O.OOO.OO', 'O.....OO', 'OOOOOOOO', '.OOOOOOO'],
};

const ICON_ROWS = Object.fromEntries(
  Object.entries(ICONS).map(([name, map]) => [
    name,
    {
      active: toPixelRows(map, { O: colors.onAccent }),
      inactive: toPixelRows(map, { O: colors.placeholder }),
    },
  ]),
);

const LABELS: Record<string, string> = {
  index: 'HOME',
  workout: 'WORKOUT',
  recipes: 'RECIPES',
};

// A chunky pixel tab bar: cream strip with a navy top edge, the active tab on a pink block
function PixelTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View role="tablist" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const focused = index === state.index;
        const label = LABELS[route.name] ?? descriptors[route.key]?.options.title ?? route.name;
        const icon = ICON_ROWS[route.name];
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <Pressable
            key={route.key}
            role="tab"
            accessibilityLabel={label.toLowerCase()}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={({ pressed }) => [styles.tab, focused && styles.tabActive, pressed && styles.pressed]}>
            {icon && (
              <View aria-hidden>
                <PixelArt rows={focused ? icon.active : icon.inactive} pixelSize={3} />
              </View>
            )}
            <Text style={[styles.label, !focused && styles.labelInactive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <PixelTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="workout" options={{ title: 'Workout' }} />
      <Tabs.Screen name="recipes" options={{ title: 'Recipes' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: 12,
    borderTopWidth: 4,
    borderTopColor: colors.navy,
    backgroundColor: colors.cream,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  tabActive: {
    borderColor: colors.navy,
    backgroundColor: colors.lycheePink,
    boxShadow: `3px 3px 0 ${colors.navy}`,
  },
  pressed: {
    transform: [{ translateY: 2 }],
  },
  label: {
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: colors.onAccent,
  },
  labelInactive: {
    color: colors.placeholder,
  },
});
