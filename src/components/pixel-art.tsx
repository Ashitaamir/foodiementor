import { StyleSheet, View } from 'react-native';

type Run = { color: string | null; length: number };

// Turn a pixel map (one character per pixel) into rows of same-colour runs,
// so each row draws as a few blocks instead of one view per pixel.
export function toPixelRows(map: string[], colors: Record<string, string>): Run[][] {
  return map.map((row) => {
    const runs: Run[] = [];
    for (const char of row) {
      const color = colors[char] ?? null;
      const last = runs[runs.length - 1];
      if (last && last.color === color) {
        last.length += 1;
      } else {
        runs.push({ color, length: 1 });
      }
    }
    return runs;
  });
}

type Props = {
  rows: Run[][]; // from toPixelRows (build once, outside the component)
  pixelSize: number;
};

// Draws pixel art; decorative, so it's hidden from screen readers by its parent.
export function PixelArt({ rows, pixelSize }: Props) {
  return (
    <View>
      {rows.map((runs, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {runs.map((run, runIndex) => (
            <View
              key={runIndex}
              style={{
                width: run.length * pixelSize,
                height: pixelSize,
                backgroundColor: run.color ?? 'transparent',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
});
