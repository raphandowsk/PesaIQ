import { Pressable, ScrollView } from 'react-native';

import { colors, fonts, MIN_TOUCH, radius, space } from '../../theme';
import {
  INCOME_CATEGORIES,
  isIncoming,
  MONEY_CATEGORY_LABELS,
  SPENDING_CATEGORIES,
  type MoneyCategory,
  type TransactionType,
} from '../../types/domain';
import { Text } from '../ui/Text';

/** The categories that fit the money's direction, plus the current one if it does not. */
export function categoryOptions(
  type: TransactionType,
  current: MoneyCategory | null,
): MoneyCategory[] {
  const side = isIncoming(type) ? INCOME_CATEGORIES : SPENDING_CATEGORIES;
  return current && !side.includes(current) ? [...side, current] : [...side];
}

/**
 * Category chips in one scrolling row. Violet, so they read apart from the
 * lime type chips that usually sit just above them.
 */
export function CategoryPicker({
  type,
  value,
  onChange,
}: {
  type: TransactionType;
  value: MoneyCategory | null;
  onChange: (category: MoneyCategory) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel="Category"
      contentContainerStyle={{ gap: 6, paddingRight: space[2] }}
    >
      {categoryOptions(type, value).map((option) => {
        const on = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={MONEY_CATEGORY_LABELS[option]}
            style={({ pressed }) => ({
              minHeight: MIN_TOUCH,
              paddingHorizontal: space[3],
              borderRadius: radius.pill,
              borderWidth: 1,
              justifyContent: 'center',
              borderColor: on ? colors.accentRamp[300] : colors.neutralRamp[300],
              backgroundColor: on
                ? colors.accentRamp[200]
                : pressed
                  ? colors.neutralRamp[200]
                  : 'transparent',
            })}
          >
            <Text
              variant="small"
              style={{
                fontFamily: fonts.bold,
                fontSize: 12,
                color: on ? colors.accentRamp[900] : colors.neutralRamp[800],
              }}
            >
              {MONEY_CATEGORY_LABELS[option]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
