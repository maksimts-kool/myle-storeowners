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
            All stores
          </Title>
          <Text c="dimmed">
            {me.role === "store_owner"
              ? "Manage your own stores, and browse the rest of the mall."
              : "Browse store layouts and current live files across the mall."}
          </Text>
        </div>

        {isLoading && (
          <Center py="xl"><Loader color="grape" /></Center>
        )}
        {isError && <Alert color="red">Could not load your stores. Please refresh.</Alert>}

        {stores && stores.length === 0 && (
          <Alert color="grape" icon={<IconMoodEmpty size={20} />} radius="lg">
            <Text fw={600}>No stores in the mall yet</Text>
            <Text size="sm">Create a store from the game owner dashboard.</Text>
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
