import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { IconChevronRight, IconMapPin, IconUserCheck } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import type { StoreSummary } from "../api/client";
import { floorLabel, storeStatusColor, versionIdentifier } from "../utils/format";

export function StoreCard({ store }: { store: StoreSummary }) {
  const statusColor = storeStatusColor(store.status, store.statusLabel);
  return (
    <Card
      component={Link}
      to={`/stores/${store.code}`}
      withBorder
      radius="md"
      padding="lg"
      style={{ height: "100%" }}
      className="store-card"
    >
      <Stack gap="sm" h="100%">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
          <Group gap="xs" align="center" wrap="nowrap">
            <Text fw={900} fz={30} lh={1}>{store.code}</Text>
            <Badge className="store-card__badge" variant="light" color="blue" leftSection={<IconMapPin size={12} />}>
              {floorLabel(store.floor)}
            </Badge>
          </Group>
          <Badge className="store-card__badge" color={statusColor} variant={store.status === "CLOSED" ? "outline" : "filled"} size="lg">
            {store.status === "CLOSED" ? "Closed" : store.status === "ELECTION" ? "Election" : store.statusLabel}
          </Badge>
        </Group>

        <Group gap="xs" wrap="wrap">
          <Text fw={600} fz="lg">{store.displayName}</Text>
          {store.isOwner && (
            <Badge color="teal" variant="light" leftSection={<IconUserCheck size={12} />}>
              Your store
            </Badge>
          )}
        </Group>

        <Stack gap={2}>
          <Text size="sm" c="dimmed">
            Owner: {store.ownerDisplayName || (store.ownerDiscordId ? "Roblox account not linked" : "Unassigned")}
          </Text>
          {store.storeIdentifier && (
            <Text size="xs" ff="monospace" c="dimmed">ID: {store.storeIdentifier}</Text>
          )}
        </Stack>

        <Group justify="space-between" mt="auto" pt="xs">
          <Text size="sm" c={store.currentVersion ? undefined : "dimmed"}>
            {store.currentVersion
              ? `Live: ${versionIdentifier(store.code, store.currentVersion.versionNumber, store.currentVersion.createdAt)}`
              : "No live file yet"}
          </Text>
          <IconChevronRight size={18} opacity={0.5} />
        </Group>
      </Stack>
    </Card>
  );
}
