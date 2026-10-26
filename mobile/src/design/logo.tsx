import { Image } from 'react-native';

const colorLogo = require('../../assets/brand/3k-logo.png');
const whiteLogo = require('../../assets/brand/beyaz-logo.png');

const ratio = { color: 1, white: 546 / 407 };

export function Logo({ variant = 'color', height = 40 }: { variant?: 'color' | 'white'; height?: number }) {
  return (
    <Image
      accessibilityLabel="3K Kampüs"
      source={variant === 'white' ? whiteLogo : colorLogo}
      resizeMode="contain"
      style={{ height, width: height * ratio[variant] }}
    />
  );
}
