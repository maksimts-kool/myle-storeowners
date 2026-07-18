import { Alert, Card, Center, Container, Divider, Group, Loader, Stack, Switch, Text, Title } from "@mantine/core";
import { IconBell, IconSettings } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { getNotificationPrefs, type MeResponse, type NotificationPrefs } from "../api/client";
import { useUpdateNotificationPrefs } from "../api/mutations";

interface ToggleDef {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
  adminOnly?: boolean;
}

const TOGGLES: ToggleDef[] = [
  { key: "submissionReceived", label: "Upload received", description: "When your uploaded file is received and queued for review." },
  { key: "submissionApproved", label: "Approved", description: "When a submission is approved and queued to publish." },
  { key: "submissionDeclined", label: "Declined", description: "When a submission is declined, with the reason." },
  { key: "submissionPublished", label: "Published", description: "When your file goes live in the game." },
  { key: "reviewNeeded", label: "Review needed", description: "When any store uploads a file that needs your review.", adminOnly: true },
];

export function SettingsPage({ me }: { me: MeResponse }) {
  const isAdmin = me.role === "admin";
  const { data: prefs, isLoading, isError } = useQuery({ queryKey: ["notificationPrefs"], queryFn: getNotificationPrefs });
  const update = useUpdateNotificationPrefs();

  const toggles = TOGGLES.filter((t) => !t.adminOnly || isAdmin);

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2}>
            <IconSettings size={26} style={{ verticalAlign: "-4px", marginRight: 8 }} />
            Settings
          </Title>
          <Text c="dimmed">Manage how the portal reaches you.</Text>
        </div>

        <Card withBorder radius="lg" padding="lg">
          <Group gap="sm" mb="xs">
            <IconBell size={20} />
            <Text fw={700} fz="lg">Discord notifications</Text>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            These are the direct messages the bot sends to your Discord account. Turn off any you don't want.
          </Text>

          {isLoading && <Center py="md"><Loader color="grape" size="sm" /></Center>}
          {isError && <Alert color="red">Could not load your notification settings. Please refresh.</Alert>}

          {prefs && (
            <Stack gap={0}>
              {toggles.map((t, i) => (
                <div key={t.key}>
                  {i > 0 && <Divider my="sm" />}
                  <Group justify="space-between" wrap="nowrap" gap="lg">
                    <div>
                      <Text fw={500}>{t.label}</Text>
                      <Text size="xs" c="dimmed">{t.description}</Text>
                    </div>
                    <Switch
                      checked={prefs[t.key]}
                      disabled={update.isPending}
                      onChange={(e) => update.mutate({ [t.key]: e.currentTarget.checked })}
                      color="grape"
                    />
                  </Group>
                </div>
              ))}
            </Stack>
          )}
        </Card>
      </Stack>
    </Container>
  );
}
