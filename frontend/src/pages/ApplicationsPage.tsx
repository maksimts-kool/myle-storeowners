import { Alert, Badge, Button, Card, Center, Container, Divider, Group, Loader, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconBuildingStore, IconCheckbox, IconCheck, IconClock, IconInfoCircle, IconTrophy, IconUserCheck } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { getElections, type ApplicationStatus, type ElectionStore, type MemberElection } from "../api/client";
import { useApplyForElection, useWithdrawMyApplication, useUndoElectionVote, useVoteForApplication } from "../api/mutations";
import { floorLabel, formatDate, phaseColor, phaseLabel, timeLeft } from "../utils/format";

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

function StoreCard({ election, store }: { election: MemberElection; store: ElectionStore }) {
  const apply = useApplyForElection();
  const vote = useVoteForApplication();
  const undoVote = useUndoElectionVote();
  const appliedHere = election.myApplication?.storeCode === store.code && election.myApplication.status === "APPLIED";
  const voteCast = store.myVoteApplicationId !== null;

  return (
    <Card withBorder radius="lg" padding="lg" h="100%">
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <IconBuildingStore size={25} />
          <div>
            <Text fw={800} fz="xl">{store.code}</Text>
            <Text size="sm" c="dimmed">{store.displayName} · {floorLabel(store.floor)}</Text>
          </div>
        </Group>
        {store.winnerApplicationId && <Badge color="teal" variant="light">Decided</Badge>}
      </Group>

      {election.canApply ? (
        <Button
          fullWidth
          variant="light"
          color="grape"
          leftSection={<IconUserCheck size={18} />}
          loading={apply.isPending && apply.variables === store.code}
          disabled={apply.isPending}
          onClick={() => apply.mutate(store.code)}
        >
          Apply to manage {store.code}
        </Button>
      ) : appliedHere ? (
        <Alert color="blue" icon={<IconCheck size={17} />} mt="xs">This is the store you applied for.</Alert>
      ) : null}

      <Divider label={<Text size="sm" fw={700}>Candidates</Text>} labelPosition="left" my="lg" />

      {store.candidates.length === 0 ? (
        <Text c="dimmed" size="sm">
          {election.phase === "applications" ? "Nobody has applied yet." : "Nobody applied for this store."}
        </Text>
      ) : (
        <Stack gap="sm">
          {store.candidates.map((candidate) => {
            const mine = store.myVoteApplicationId === candidate.id;
            const won = store.winnerApplicationId === candidate.id;
            const blocked = appliedHere || candidate.isCurrentUser;
            return (
              <Card key={candidate.id} withBorder radius="md" padding="sm">
                <Group justify="space-between" wrap="nowrap" align="center">
                  <div style={{ minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                      {won && <IconTrophy size={16} color="var(--mantine-color-yellow-6)" />}
                      <Text fw={650} truncate>{candidate.robloxName || candidate.displayName}</Text>
                    </Group>
                    {candidate.robloxName && <Text size="xs" c="dimmed" truncate>Discord: {candidate.displayName}</Text>}
                    <Text size="xs" c="dimmed">{candidate.voteCount} vote{candidate.voteCount === 1 ? "" : "s"}</Text>
                  </div>
                  {election.canVote && (mine ? (
                    <Button
                      size="compact-sm"
                      variant="light"
                      color="orange"
                      loading={undoVote.isPending && undoVote.variables === store.code}
                      disabled={undoVote.isPending || vote.isPending}
                      onClick={() => undoVote.mutate(store.code)}
                    >
                      Undo vote
                    </Button>
                  ) : (
                    <Button
                      size="compact-sm"
                      variant="light"
                      color="grape"
                      disabled={voteCast || blocked || vote.isPending || undoVote.isPending}
                      loading={vote.isPending && vote.variables === candidate.id}
                      onClick={() => vote.mutate(candidate.id)}
                    >
                      {candidate.isCurrentUser ? "You" : appliedHere ? "Your store" : voteCast ? "Vote cast" : "Vote"}
                    </Button>
                  ))}
                </Group>
              </Card>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}

/** One line telling a member exactly what they can do in this round right now. */
function phaseHint(election: MemberElection): string {
  switch (election.phase) {
    case "upcoming":
      return `Applications open ${formatDate(election.applicationsOpenAt)}.`;
    case "applications":
      return election.canVote
        ? "Applications and voting are both open."
        : `Applications are open. Voting starts ${formatDate(election.votingOpensAt)}.`;
    case "review":
      return `The candidate list is final. Voting opens ${formatDate(election.votingOpensAt)}.`;
    case "voting":
      return "Voting is open — one vote per store, and you can change it until voting closes.";
    case "tallying":
      return "Voting has closed. A Game owner is confirming the results.";
    default:
      return "";
  }
}

function ElectionSection({ election }: { election: MemberElection }) {
  const withdraw = useWithdrawMyApplication();
  const mine = election.myApplication;

  function confirmWithdraw(id: string) {
    modals.openConfirmModal({
      title: "Withdraw this application?",
      children: <Text size="sm">Your application and the votes cast for it are deleted. You can apply for another store while applications are open.</Text>,
      labels: { confirm: "Withdraw", cancel: "Keep application" },
      confirmProps: { color: "red" },
      onConfirm: () => withdraw.mutate(id),
    });
  }

  return (
    <Stack gap="md">
      <Card withBorder radius="lg" padding="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Group gap="sm">
              <Title order={3}>{election.title}</Title>
              <Badge color={phaseColor(election.phase)} variant="light">{phaseLabel(election.phase)}</Badge>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>{phaseHint(election)}</Text>
            {election.note && <Text size="sm" mt="xs">“{election.note}”</Text>}
          </div>
          {election.nextDeadline && (
            <Badge size="lg" variant="light" color="blue" leftSection={<IconClock size={14} />}>
              {timeLeft(election.nextDeadline)} left
            </Badge>
          )}
        </Group>

        {mine && (
          <Group
            justify="space-between"
            align="center"
            wrap="wrap"
            mt="md"
            pt="md"
            style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
          >
            <Text size="sm">
              You applied for <Text span fw={700}>{mine.storeCode}</Text> · {mine.storeName} on {formatDate(mine.createdAt)}
            </Text>
            <Group gap="xs">
              <Badge color={STATUS_COLOR[mine.status]} variant="light">{STATUS_LABEL[mine.status]}</Badge>
              {mine.status === "APPLIED" && election.phase === "applications" && (
                <Button color="red" variant="light" size="compact-sm" loading={withdraw.isPending} onClick={() => confirmWithdraw(mine.id)}>
                  Withdraw
                </Button>
              )}
            </Group>
          </Group>
        )}
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
        {election.stores.map((store) => <StoreCard key={store.code} election={election} store={store} />)}
      </SimpleGrid>
    </Stack>
  );
}

export function ApplicationsPage() {
  // The windows move on their own, so keep the page roughly in step with them.
  const elections = useQuery({ queryKey: ["elections"], queryFn: getElections, refetchInterval: 60_000 });

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={2}>
            <IconCheckbox size={27} style={{ verticalAlign: "-4px", marginRight: 8 }} />
            Store elections
          </Title>
          <Text c="dimmed">Apply for one store per election, then vote once for every other store in that round.</Text>
        </div>

        <Alert color="grape" icon={<IconInfoCircle size={19} />} radius="lg">
          Each election runs to a schedule: applications first, then voting, then the results. Every Bloxlink-verified
          member gets one application and one vote per store, and cannot vote for the store they applied to. Vote counts
          are visible to everyone while voting is open.
        </Alert>

        {elections.isLoading && <Center py="xl"><Loader color="grape" /></Center>}
        {elections.isError && <Alert color="red">Could not load store elections. Please refresh.</Alert>}
        {elections.data && elections.data.elections.length === 0 && (
          <Alert color="blue">There are no elections scheduled right now.</Alert>
        )}

        {elections.data?.elections.map((election) => <ElectionSection key={election.id} election={election} />)}
      </Stack>
    </Container>
  );
}
