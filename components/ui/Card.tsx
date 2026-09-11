import { View, type ViewProps } from 'react-native';

import { colors, radius, shadow, space } from '../../theme';

export interface CardProps extends ViewProps {
  elevation?: 'none' | 'sm' | 'md' | 'lg';
  padded?: boolean;
}

/** Surface-filled container. The design rounds cards generously. */
export function Card({ elevation = 'sm', padded = true, style, ...rest }: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: padded ? space[4] : 0,
        },
        elevation !== 'none' && shadow[elevation],
        style,
      ]}
      {...rest}
    />
  );
}
