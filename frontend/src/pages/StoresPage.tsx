import { Alert, Center, Container, Loader, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconBuildingStore, IconMoodEmpty } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { getStores, type MeResponse } from "../api/client";
import { StoreCard } from "../components/StoreCard";

export function StoresPage({ me }: { me: MeResponse }) {
  const { data: stores, isLoading, isError } = useQuery({ queryKey: ["stores"], queryFn: getStores });

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2}>
            <IconBuildingStore size={26} style={{ verticalAlign: "-4px", marginRight: 8 }} />
            {me.role === "admin" ? "All stores" : "My stores"}
          </Title>
          <Text c="dimmed">
            {me.role === "admin"
              ? "Every store in the mall. Open one to review and manage its files."
              : "Open a store to upload a new file, download templates, and see its status."}
          </Text>
        </div>

        {isLoading && (
          <Center py="xl"><Loader color="grape" /></Center>
        )}
        {isError && <Alert color="red">Could not load your stores. Please refresh.</Alert>}

        {stores && stores.length === 0 && (
          <Alert color="grape" icon={<IconMoodEmpty size={20} />} radius="lg">
            <Text fw={600}>No stores assigned to you yet</Text>
            <Text size="sm">
              Your Discord account isn't linked to a store. Ask the game owner to assign your store to you.
            </Text>
          </Alert>
        )}

        {stores && stores.length > 0 && (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
            {stores.map((store) => (
              <StoreCard key={store.code} store={store} />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  );
}
