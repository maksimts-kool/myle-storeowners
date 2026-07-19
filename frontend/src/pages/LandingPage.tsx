import { Alert, Button, Card, Center, Stack, Text, Title } from "@mantine/core";
import { IconBrandDiscord, IconInfoCircle } from "@tabler/icons-react";
import { useSearchParams } from "react-router-dom";
import { loginUrl } from "../api/client";

const AUTH_ERRORS: Record<string, string> = {
  invalid_state: "Your login session expired. Please try again.",
  login_failed: "Discord login failed. Please try again.",
  access_denied: "You cancelled the Discord authorization.",
  not_assigned: "Your Discord account is not assigned to a store.",
};

export function LandingPage() {
  const [params] = useSearchParams();
  const error = params.get("auth_error");

  return (
    <div className="app-backdrop">
      <Center mih="calc(100vh - 32px)" p="md">
        <Card withBorder radius="md" padding="xl" maw={440} w="100%">
          <Stack gap="lg" align="center">
            <Text fz={56} lh={1}>🏬</Text>
            <Stack gap={4} align="center">
              <Title order={2} ta="center">My Lifts Mall</Title>
              <Text c="dimmed" ta="center">Store Owners Portal</Text>
            </Stack>
            <Text ta="center" size="sm" c="dimmed">
              Upload new versions, download your files, and track your store.
            </Text>

            {error && (
              <Alert color="red" icon={<IconInfoCircle size={18} />} w="100%">
                {AUTH_ERRORS[error] ?? "Login failed. Please try again."}
              </Alert>
            )}

            <Button
              component="a"
              href={loginUrl}
              size="md"
              radius="md"
              fullWidth
              color="indigo"
              leftSection={<IconBrandDiscord size={22} />}
            >
              Log in with Discord
            </Button>
            <Text size="xs" c="dimmed" ta="center">
              Use the Discord account linked to your store.
            </Text>
          </Stack>
        </Card>
      </Center>
    </div>
  );
}
