import { TextInput } from 'react-native';
import { Search } from 'lucide-react-native';
import { View } from 'react-native';

import { useFontState } from '@/design/fonts';
import { Icon } from '@/design/icons';
import { usePalette } from '@/design/theme';
import { font, space } from '@/design/tokens';

export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  const palette = usePalette();
  const fonts = useFontState();
  return (
    <View style={{ height: 48, borderRadius: 16, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, gap: 10, borderWidth: 1, borderColor: palette.line }}>
      <Icon icon={Search} color={palette.muted} />
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        style={{ flex: 1, color: palette.ink, fontFamily: fonts.active ? font.regular : undefined, fontSize: 16, minWidth: 0 }}
      />
    </View>
  );
}
