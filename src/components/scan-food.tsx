import { FunctionsHttpError } from '@supabase/supabase-js';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withCommas } from '@/components/calorie-bar';
import { Lilo } from '@/components/lilo';
import { MealChat, MealTypePicker, type MealPhoto } from '@/components/meal-chat';
import { colors, fonts } from '@/constants/fm-theme';
import { mealTypeForNow, type MealType } from '@/lib/meal-draft';
import { pickPhoto, shrinkPhoto } from '@/lib/photo';
import { supabase } from '@/lib/supabase';

type Product = {
  barcode: string;
  product_name: string;
  brands: string | null;
  serving_size: string | null;
  serving_g: number | null;
  energy_kcal: number;
};

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

// "Scan with camera": snap a plate (Lilo identifies it in the chat) or scan a packet's barcode.
export function ScanFood() {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const scanning = useRef(false);
  const [mode, setMode] = useState<'photo' | 'barcode'>('photo');
  const [photo, setPhoto] = useState<MealPhoto | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // A photo hands over to the chat, where Lilo looks at it and asks quick questions
  if (photo) {
    return <MealChat initialPhoto={photo} />;
  }
  if (product) {
    return <ProductCard product={product} onBack={() => setProduct(null)} />;
  }

  const takePhoto = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.8 });
      const shrunk = picture ? await shrinkPhoto(picture.uri) : null;
      if (shrunk) setPhoto(shrunk);
      else setMessage('Could not take the photo. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const fromLibrary = async () => {
    const picked = await pickPhoto();
    if (picked) setPhoto(picked);
  };

  const onBarcode = async (result: BarcodeScanningResult) => {
    if (scanning.current) return;
    scanning.current = true;
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke('lookup-barcode', {
      body: { barcode: result.data },
    });
    setBusy(false);
    if (error) {
      let reason = 'Could not look that up. Please try again.';
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.json().catch(() => null);
        if (body?.error) reason = body.error;
      }
      setMessage(reason);
      // Let the user try another barcode after a moment
      setTimeout(() => {
        scanning.current = false;
      }, 1500);
      return;
    }
    setProduct(data.product as Product);
    scanning.current = false;
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Header title="SCAN WITH CAMERA" />

      <View style={styles.tabs} accessibilityRole="tablist">
        {(['photo', 'barcode'] as const).map((tab) => (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === tab }}
            onPress={() => {
              setMode(tab);
              setMessage(null);
            }}
            style={[styles.tab, mode === tab && styles.tabSelected]}>
            <Text style={[styles.tabText, mode === tab && styles.tabTextSelected]}>
              {tab === 'photo' ? 'Plate photo' : 'Barcode'}
            </Text>
          </Pressable>
        ))}
      </View>

      {!permission ? (
        <ActivityIndicator color={colors.navy} style={styles.flex} />
      ) : !permission.granted ? (
        <View style={styles.center}>
          <Lilo pixelSize={5} bob />
          <Text style={styles.body}>Lilo needs your camera to see your food.</Text>
          <Pressable accessibilityRole="button" onPress={requestPermission} style={styles.primary}>
            <Text style={styles.primaryText}>ALLOW CAMERA</Text>
          </Pressable>
          {mode === 'photo' && (
            <Pressable accessibilityRole="button" onPress={fromLibrary} style={styles.link}>
              <Text style={styles.linkText}>Or choose a photo</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.flex}>
          <View style={styles.cameraFrame}>
            <CameraView
              ref={camera}
              style={styles.flex}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={mode === 'barcode' ? onBarcode : undefined}
            />
            {mode === 'barcode' && <View style={styles.scanBox} pointerEvents="none" />}
          </View>

          <Text style={styles.body} accessibilityLiveRegion="polite">
            {message ??
              (mode === 'photo'
                ? 'Fit your whole plate in the picture.'
                : 'Point the camera at the barcode on the packet.')}
          </Text>

          {busy && <ActivityIndicator color={colors.navy} />}

          {mode === 'photo' && (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                disabled={busy}
                onPress={takePhoto}
                style={({ pressed }) => [styles.shutter, pressed && styles.pressed]}>
                <View style={styles.shutterInner} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={fromLibrary} style={styles.link}>
                <Text style={styles.linkText}>Choose a photo instead</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.backButton}>
        <Text style={styles.backText}>{'<'}</Text>
      </Pressable>
      <Text style={styles.headerTitle} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

// A scanned packet: choose how much, then save. Calories are worked out by the database.
function ProductCard({ product, onBack }: { product: Product; onBack: () => void }) {
  const serving = product.serving_g ? Number(product.serving_g) : null;
  const [grams, setGrams] = useState(serving ?? 100);
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kcal = Math.round((Number(product.energy_kcal) * grams) / 100);

  const save = async () => {
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.from('food_logs').insert({
      off_barcode: product.barcode,
      grams,
      status: 'confirmed',
      input_method: 'barcode',
      meal_type: mealType,
    });
    setSaving(false);
    if (saveError) {
      console.warn('Saving product failed:', saveError.code, saveError.message);
      setError('Could not save. Please try again.');
      return;
    }
    setSaved(true);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Header title="SCANNED!" />
      <ScrollView contentContainerStyle={styles.productContent}>
        <View style={styles.card}>
          <Text style={styles.productName}>{product.product_name}</Text>
          {product.brands && <Text style={styles.body}>{product.brands}</Text>}
          <Text style={styles.body}>{withCommas(Number(product.energy_kcal))} kcal per 100 g</Text>
        </View>

        <Text style={styles.label}>How much did you have?</Text>
        <View style={styles.chips}>
          {serving && (
            <Pressable accessibilityRole="button" onPress={() => setGrams(serving)} style={styles.chip}>
              <Text style={styles.chipText}>
                1 serving{product.serving_size ? ` (${product.serving_size})` : ''}
              </Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={() => setGrams(100)} style={styles.chip}>
            <Text style={styles.chipText}>100 g</Text>
          </Pressable>
        </View>
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Less"
            onPress={() => setGrams((g) => Math.max(5, g - (serving ? serving / 2 : 10)))}
            style={styles.stepButton}>
            <Text style={styles.stepText}>-</Text>
          </Pressable>
          <Text style={styles.amount}>
            {Math.round(grams)} g · {withCommas(kcal)} kcal
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More"
            onPress={() => setGrams((g) => Math.min(5000, g + (serving ? serving / 2 : 10)))}
            style={styles.stepButton}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>

        <MealTypePicker value={mealType} onChange={setMealType} />

        {error && <Text style={styles.error}>{error}</Text>}

        {saved ? (
          <>
            <Text style={styles.success}>Saved to today!</Text>
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.primary}>
              <Text style={styles.primaryText}>BACK TO HOME</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: saving, disabled: saving }}
            disabled={saving}
            onPress={save}
            style={styles.primary}>
            {saving ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryText}>SAVE</Text>}
          </Pressable>
        )}

        <Pressable accessibilityRole="button" onPress={onBack} style={styles.link}>
          <Text style={styles.linkText}>Scan something else</Text>
        </Pressable>

        <Text style={styles.credit}>
          Product data © Open Food Facts contributors, available under the Open Database Licence.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
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
    borderRadius: 10,
    backgroundColor: colors.cream,
  },
  backText: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.navy,
  },
  headerTitle: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: colors.navy,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  tabSelected: {
    backgroundColor: colors.navy,
  },
  tabText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 15,
    color: colors.navy,
  },
  tabTextSelected: {
    color: colors.cream,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  cameraFrame: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.navy,
    overflow: 'hidden',
  },
  scanBox: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '38%',
    height: 110,
    borderWidth: 4,
    borderColor: colors.arcadeYellow,
    borderRadius: 10,
  },
  body: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.navy,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actions: {
    alignItems: 'center',
    gap: 4,
    paddingBottom: 16,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.lycheePink,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'center',
  },
  linkText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 15,
    color: colors.berry,
    textDecorationLine: 'underline',
  },
  primary: {
    height: 56,
    minWidth: 200,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `4px 4px 0 ${colors.lycheePink}`,
  },
  primaryText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.cream,
  },
  productContent: {
    gap: 14,
    padding: 16,
  },
  card: {
    gap: 4,
    padding: 16,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `4px 4px 0 ${colors.navy}`,
  },
  productName: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    lineHeight: 20,
    color: colors.navy,
    textAlign: 'center',
  },
  label: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 16,
    color: colors.navy,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  chipText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 14,
    color: colors.navy,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.navy,
  },
  amount: {
    flex: 1,
    fontFamily: fonts.bodyHeavy,
    fontSize: 17,
    color: colors.navy,
    textAlign: 'center',
  },
  error: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.berry,
    textAlign: 'center',
  },
  success: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.navy,
    textAlign: 'center',
  },
  credit: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    color: colors.plum,
    textAlign: 'center',
  },
});
