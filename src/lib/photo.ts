import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { MealPhoto } from '@/components/meal-chat';

// Photos are shrunk to 1024 px wide before going to Lilo: plenty to recognise food,
// and well under the server's size limit.
const MAX_WIDTH = 1024;

export async function shrinkPhoto(uri: string): Promise<MealPhoto | null> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: MAX_WIDTH, height: null });
  const image = await context.renderAsync();
  const result = await image.saveAsync({
    base64: true,
    compress: 0.7,
    format: SaveFormat.JPEG,
  });
  return result.base64 ? { base64: result.base64, mimeType: 'image/jpeg' } : null;
}

// Pick a photo or screenshot from the phone's library (null if the user cancels)
export async function pickPhoto(): Promise<MealPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets?.[0]) return null;
  return shrinkPhoto(result.assets[0].uri);
}
