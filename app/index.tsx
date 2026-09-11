import { View } from 'react-native';

import { Button, Card, Screen, Tag, Text } from '../components/ui';
import { colors, money, space } from '../theme';

/**
 * Phase 1A foundation check.
 *
 * Renders the theme primitives so the tokens, fonts and layout can be verified
 * in Expo Go. Phase 1B replaces this with the real entry point (onboarding
 * gate → tabs).
 */
export default function FoundationCheck() {
  return (
    <Screen scroll>
      <View style={{ paddingTop: space[6], gap: space[2] }}>
        <Text variant="kicker" tone="accent">
          PesaIQ · Stage 1
        </Text>
        <Text variant="display">SMS intelligence, on the phone</Text>
        <Text variant="body" tone="muted">
          Phase 1A foundation check — theme tokens, Plus Jakarta Sans and the shared primitives.
        </Text>
      </View>

      <Card style={{ marginTop: space[6], gap: space[3] }}>
        <Text variant="kicker" tone="muted">
          Type scale
        </Text>
        <Text variant="h1">Heading one</Text>
        <Text variant="h2">Heading two</Text>
        <Text variant="h3">Heading three</Text>
        <Text variant="body">Body copy at fifteen pixels.</Text>
        <Text variant="small" tone="muted">
          Small muted metadata.
        </Text>
      </Card>

      <Card style={{ marginTop: space[3], gap: space[3] }}>
        <Text variant="kicker" tone="muted">
          Money direction
        </Text>
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <View
            style={{
              flex: 1,
              backgroundColor: money.in.tint,
              borderRadius: 20,
              padding: space[3],
            }}
          >
            <Text variant="kicker" style={{ color: money.in.ink }}>
              Received
            </Text>
            <Text variant="amount" style={{ color: money.in.amount }}>
              +250,000
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: money.out.tint,
              borderRadius: 20,
              padding: space[3],
            }}
          >
            <Text variant="kicker" style={{ color: money.out.ink }}>
              Sent
            </Text>
            <Text variant="amount" style={{ color: money.out.amount }}>
              −45,000
            </Text>
          </View>
        </View>
      </Card>

      <Card style={{ marginTop: space[3], gap: space[3] }}>
        <Text variant="kicker" tone="muted">
          Components
        </Text>
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          <Tag label="Demo" tone="accent" />
          <Tag label="Confirmed" tone="positive" />
          <Tag label="Needs review" tone="outline" />
          <Tag label="Stage 1" tone="neutral" />
        </View>
        <Button label="Analyze SMS" />
        <Button label="Secondary" variant="secondary" />
        <Button label="Ghost" variant="ghost" />
      </Card>

      <Text variant="small" tone="faint" style={{ marginTop: space[4] }}>
        Ground {colors.bg} · accent {colors.accent} · accent-2 {colors.accent2}
      </Text>
    </Screen>
  );
}
