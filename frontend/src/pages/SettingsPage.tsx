import { useEffect, useState } from "react";
import { Alert, Button, Card, Center, Container, Divider, Group, Loader, Select, Stack, Switch, Text, Title } from "@mantine/core";
import { IconBell, IconFlask, IconSettings } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { getNotificationPrefs, getStores, type DebugRole, type MeResponse, type NotificationPrefs } from "../api/client";
import { useClearDebugRole, useSetDebugRole, useUpdateNotificationPrefs } from "../api/mutations";

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
  { key: "applicationApplied", label: "Application received", description: "When your store election application is received." },
  { key: "applicationSelected", label: "Selected", description: "When you are selected to manage a store." },
  { key: "applicationNotSelected", label: "Not selected", description: "When you are not selected for a store election." },
  { key: "applicationRemoved", label: "Removed from election", description: "When a game owner removes your application." },
];

function debugRoleFor(me: MeResponse): DebugRole {
  switch (me.debugMode?.role) {
    case "store_owner": return "STORE_OWNER";
    case "member": return "MEMBER";
    default: return "GAME_OWNER";
  }
}

function DebugModeCard({ me }: { me: MeResponse }) {
  const [role, setRole] = useState<DebugRole>(debugRoleFor(me));
  const [storeCode, setStoreCode] = useState(me.debugMode?.storeCode ?? "");
  const setDebug = useSetDebugRole();
  const clearDebug = useClearDebugRole();
  const stores = useQuery({ queryKey: ["stores"], queryFn: getStores, enabled: role === "STORE_OWNER" });

  useEffect(() => {
    setRole(debugRoleFor(me));
    setStoreCode(me.debugMode?.storeCode ?? "");
  }, [me]);

  const storeOptions = (stores.data ?? []).map((store) => ({ value: store.code, label: `${store.code} · ${store.displayName}` }));
  const requiresStore = role === "STORE_OWNER";

  return (
    <Card withBorder radius="lg" padding="lg">
      <Group gap="sm" mb="xs">
        <IconFlask size={20} />
        <Text fw={700} fz="lg">Debug role preview</Text>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Preview the portal as a different role in this browser session. It changes API permissions as well as the interface, but does not change anyone's real assignment.
      </Text>
      <Stack gap="sm">
        <Select
          label="Act as"
          data={[
            { value: "GAME_OWNER", label: "Game owner" },
            { value: "STORE_OWNER", label: "Store owner" },
            { value: "MEMBER", label: "Member" },
          ]}
          value={role}
          onChange={(value) => setRole((value ?? "GAME_OWNER") as DebugRole)}
          allowDeselect={false}
        />
        {requiresStore && (
          <Select
            label="Store to manage"
            placeholder={stores.isLoading ? "Loading stores…" : "Choose a store"}
            data={storeOptions}
            value={storeCode || null}
            searchable
            nothingFoundMessage="No stores found"
            onChange={(value) => setStoreCode(value ?? "")}
          />
        )}
        <Group justify="flex-end" mt="xs">
          {me.debugMode && <Button variant="default" loading={clearDebug.isPending} onClick={() => clearDebug.mutate()}>Stop debugging</Button>}
          <Button color="orange" loading={setDebug.isPending} disabled={requiresStore && !storeCode} onClick={() => setDebug.mutate({ role, ...(requiresStore ? { storeCode } : {}) })}>
            Apply preview
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export function SettingsPage({ me }: { me: MeResponse }) {
  const isAdmin = me.role === "game_owner";
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
          <Text size="sm" c="dimmed" mb="md">Turn off any messages you don't want.</Text>

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

        {me.canDebug && <DebugModeCard me={me} />}
      </Stack>
    </Container>
  );
}
