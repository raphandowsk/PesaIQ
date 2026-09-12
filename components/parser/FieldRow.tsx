import { Pressable, TextInput, View } from 'react-native';

import type { DraftFieldView } from '../../features/lab/draft';
import { colors, fonts, MIN_TOUCH, radius, space } from '../../theme';
import {
  TRANSACTION_TYPES,
  TYPE_LABELS,
  type MoneyCategory,
  type TransactionType,
} from '../../types/domain';
import { Icon } from '../ui/Icon';
import { Tag } from '../ui/Tag';
import { Text } from '../ui/Text';
import { CategoryPicker } from './CategoryPicker';

export interface FieldRowProps {
  field: DraftFieldView;
  editing: boolean;
  /** The current type, for the picker. */
  type: TransactionType;
  onChangeText: (value: string) => void;
  onChangeType: (type: TransactionType) => void;
  onChangeCategory?: (category: MoneyCategory) => void;
  last?: boolean;
  /** Off for saved records, which carry no per-field score: the flag just says "Check". */
  showConfidence?: boolean;
}

const CAPITALIZE: Record<string, 'none' | 'words' | 'characters'> = {
  counterparty: 'characters',
  provider: 'words',
  reference: 'characters',
  date: 'none',
};

/** One extracted field on the Result screen: label, confidence flag, value or editor. */
export function FieldRow({
  field,
  editing,
  type,
  onChangeText,
  onChangeType,
  onChangeCategory,
  last = false,
  showConfidence = true,
}: FieldRowProps) {
  const pct = `${Math.round(field.confidence * 100)}%`;
  const ink = field.low
    ? colors.accentRamp[700]
    : field.missing && !field.verified
      ? colors.neutralRamp[700]
      : colors.text;

  return (
    <View
      style={{
        paddingVertical: space[3],
        gap: space[2],
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.divider,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text variant="kicker" tone="muted" style={{ flex: 1 }}>
          {field.label}
        </Text>
        {field.low ? (
          <View
            accessible
            accessibilityLabel={
              showConfidence ? `${pct} confidence. Check this field.` : 'Check this field.'
            }
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[1],
              backgroundColor: colors.accentRamp[200],
              borderRadius: radius.pill,
              paddingHorizontal: space[2],
              paddingVertical: 2,
            }}
          >
            <Icon name="caution" size={11} strokeWidth={3} color={colors.accentRamp[800]} />
            <Text variant="kicker" style={{ color: colors.accentRamp[800], fontSize: 10 }}>
              {showConfidence ? `${pct} · check` : 'Check'}
            </Text>
          </View>
        ) : null}
        {field.verified ? <Tag label="Verified" tone="positive" /> : null}
      </View>

      {!editing ? (
        <Text variant="bodyMedium" style={{ color: ink }}>
          {field.display}
        </Text>
      ) : field.editMode === 'text' ? (
        <TextInput
          value={field.value}
          onChangeText={onChangeText}
          accessibilityLabel={field.label}
          placeholder={field.numeric ? 'e.g. 45,000' : 'Not found'}
          placeholderTextColor={colors.neutralRamp[700]}
          keyboardType={field.numeric ? 'decimal-pad' : 'default'}
          autoCapitalize={CAPITALIZE[field.key] ?? 'none'}
          autoCorrect={false}
          style={{
            minHeight: MIN_TOUCH,
            borderWidth: 1,
            borderColor: field.low ? colors.accentRamp[400] : colors.neutralRamp[400],
            borderRadius: radius.pill,
            backgroundColor: colors.bg,
            paddingHorizontal: space[4],
            fontFamily: fonts.semibold,
            fontSize: 14,
            color: colors.text,
          }}
        />
      ) : field.editMode === 'moneyCategory' ? (
        <CategoryPicker
          type={type}
          value={(field.value || null) as MoneyCategory | null}
          onChange={(category) => onChangeCategory?.(category)}
        />
      ) : field.editMode === 'type' ? (
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
        >
          {TRANSACTION_TYPES.map((option) => {
            const on = option === type;
            return (
              <Pressable
                key={option}
                onPress={() => onChangeType(option)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={TYPE_LABELS[option]}
                style={({ pressed }) => ({
                  minHeight: MIN_TOUCH,
                  paddingHorizontal: space[3],
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  justifyContent: 'center',
                  borderColor: on ? colors.accent2Ramp[500] : colors.neutralRamp[300],
                  backgroundColor: on
                    ? colors.accent2Ramp[500]
                    : pressed
                      ? colors.neutralRamp[200]
                      : 'transparent',
                })}
              >
                <Text
                  variant="small"
                  style={{
                    fontFamily: fonts.semibold,
                    // White on lime-500 is 1.9:1; the darkest lime reads at 6.2:1.
                    color: on ? colors.accent2Ramp[900] : colors.neutralRamp[800],
                  }}
                >
                  {TYPE_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 2 }}>
          <Text variant="bodyMedium" style={{ color: ink }}>
            {field.display}
          </Text>
          <Text variant="small" tone="faint">
            {field.key === 'masked'
              ? 'Masked for privacy, so it cannot be edited.'
              : 'Kept exactly as the message states it.'}
          </Text>
        </View>
      )}
    </View>
  );
}
