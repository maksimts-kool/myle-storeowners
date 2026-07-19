import { Alert, Badge, Button, Card, Center, Container, Divider, Group, Loader, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconBuildingStore, IconCheckbox, IconCheck, IconInfoCircle, IconUserCheck } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { getElections, type ApplicationStatus, type ElectionStore } from "../api/client";
import { useApplyForElection, useCancelMyApplication, useUndoElectionVote, useVoteForApplication } from "../api/mutations";
import { floorLabel, formatDate } from "../utils/format";

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: "Application active",
  SELECTED: "Selected",
  NOT_SELECTED: "Not selected",
  REMOVED: "Removed from election",
  CANCELLED: "Cancelled",
};

const STATUS_COLOR: Record<ApplicationStatus, string> = {
  APPLIED: "blue",
  SELECTED: "teal",
  NOT_SELECTED: "gray",
  REMOVED: "red",
  CANCELLED: "gray",
};

function ElectionCard({ election, canApply, applicationStoreCode }: {
  election: ElectionStore;
  canApply: boolean;
  applicationStoreCode: string | null;
}) {
  const apply = useApplyForElection();
  const vote = useVoteForApplication();
  const undoVote = useUndoElectionVote();
  const applicationIsHere = applicationStoreCode === election.code;
  const voteCast = election.myVoteApplicationId !== null;

  return (
    <Card withBorder radius="lg" padding="lg" h="100%">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <IconBuildingStore size={25} />
          <div>
            <Text fw={800} fz="xl">{election.code}</Text>
            <Text size="sm" c="dimmed">{election.displayName} · {floorLabel(election.floor)}</Text>
          </div>
        </Group>
        <Badge color="grape" variant="light">Election</Badge>
      </Group>

      {canApply ? (
        <Button fullWidth variant="light" color="grape" leftSection={<IconUserCheck size={18} />} loading={apply.isPending} onClick={() => apply.mutate(election.code)}>
          Apply to manage {election.code}
        </Button>
      ) : applicationIsHere ? (
        <Alert color="blue" icon={<IconCheck size={17} />} mt="xs">This is the store you applied for.</Alert>
      ) : (
        <Text size="sm" c="dimmed">You have already used your election application, but you can vote below.</Text>
      )}

      <Divider label={<Text size="sm" fw={700}>Candidates</Text>} labelPosition="left" my="lg" />

      {election.candidates.length === 0 ? (
        <Text c="dimmed" size="sm">No active candidates yet.</Text>
      ) : (
        <Stack gap="sm">
          {election.candidates.map((candidate) => {
            const mine = election.myVoteApplicationId === candidate.id;
            const voteUnavailable = applicationIsHere || candidate.isCurrentUser;
            return (
              <Card key={candidate.id} withBorder radius="md" padding="sm">
                <Group justify="space-between" wrap="nowrap" align="center">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={650} truncate>{candidate.robloxName || candidate.displayName}</Text>
                    {candidate.robloxName && <Text size="xs" c="dimmed" truncate>Discord: {candidate.displayName}</Text>}
                    {typeof candidate.voteCount === "number" && <Text size="xs" c="dimmed">{candidate.voteCount} vote{candidate.voteCount === 1 ? "" : "s"}</Text>}
                  </div>
                  {mine ? (
                    <Button
                      size="compact-sm"
                      variant="light"
                      color="orange"
                      loading={undoVote.isPending && undoVote.variables === election.code}
                      disabled={undoVote.isPending || vote.isPending}
                      onClick={() => undoVote.mutate(election.code)}
                    >
                      Undo vote
                    </Button>
                  ) : (
                    <Button
                      size="compact-sm"
                      variant="light"
                      color="grape"
                      disabled={voteCast || voteUnavailable || vote.isPending || undoVote.isPending}
                      loading={vote.isPending && vote.variables === candidate.id}
                      onClick={() => vote.mutate(candidate.id)}
                    >
                      {candidate.isCurrentUser ? "Your application" : applicationIsHere ? "Your election" : voteCast ? "Vote cast" : "Vote"}
                    </Button>
                  )}
                </Group>
              </Card>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}

export function ApplicationsPage() {
  const elections = useQuery({ queryKey: ["elections"], queryFn: getElections });
  const cancel = useCancelMyApplication();
  const mine = elections.data?.myApplication;

  function confirmCancel() {
    modals.openConfirmModal({
      title: "Cancel this application?",
      children: <Text size="sm">You will still be able to vote, but cannot apply to another election store unless a Game owner later deletes this application record.</Text>,
      labels: { confirm: "Cancel application", cancel: "Keep application" },
      confirmProps: { color: "red" },
      onConfirm: () => cancel.mutate(),
    });
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2}>
            <IconCheckbox size={27} style={{ verticalAlign: "-4px", marginRight: 8 }} />
            Store elections
          </Title>
          <Text c="dimmed">Apply once for a vacant store, then cast one vote in each other open store election.</Text>
        </div>

        <Alert color="grape" icon={<IconInfoCircle size={19} />} radius="lg">
          Every Bloxlink-verified member can vote once per store and may undo a vote to choose someone else. Applicants cannot vote in the election for the store they actively applied to, including for themselves. A Game owner deleting an application record lets that member apply again.
        </Alert>

        {mine && (
          <Card withBorder radius="lg" padding="lg">
            <Group justify="space-between" align="center" wrap="wrap">
              <div>
                <Text fw={700}>Your application: {mine.storeCode}</Text>
                <Text size="sm" c="dimmed">{mine.storeName} · applied {formatDate(mine.createdAt)}</Text>
              </div>
              <Group>
                <Badge color={STATUS_COLOR[mine.status]} variant="light">{STATUS_LABEL[mine.status]}</Badge>
                {mine.status === "APPLIED" && <Button color="red" variant="light" size="compact-sm" loading={cancel.isPending} onClick={confirmCancel}>Cancel application</Button>}
              </Group>
            </Group>
          </Card>
        )}

        {elections.isLoading && <Center py="xl"><Loader color="grape" /></Center>}
        {elections.isError && <Alert color="red">Could not load store elections. Please refresh.</Alert>}
        {elections.data && elections.data.elections.length === 0 && <Alert color="blue">There are no store elections open right now.</Alert>}

        {elections.data && elections.data.elections.length > 0 && (
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
            {elections.data.elections.map((election) => (
              <ElectionCard
                key={election.code}
                election={election}
                canApply={elections.data!.canApply}
                applicationStoreCode={mine?.status === "APPLIED" ? mine.storeCode : null}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  );
}
