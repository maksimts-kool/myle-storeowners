import { useState } from "react";
import {
  Accordion, Alert, Badge, Button, Card, Center, Group, Loader, Stack, Table, Text, Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconCalendarEvent, IconCrown, IconPlus } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { getAdminElections, type AdminElection, type ElectionStoreResult } from "../api/client";
import { useElectionAction, useSetElectionWinner } from "../api/mutations";
import { formatDate, phaseColor, phaseLabel, timeLeft } from "../utils/format";
import { ElectionFormModal } from "./ElectionFormModal";

function StoreResults({ election, result }: { election: AdminElection; result: ElectionStoreResult }) {
  const setWinner = useSetElectionWinner();
  const decided = result.winnerApplicationId !== null;
  const canAssign = (election.status === "RUNNING" || election.status === "TALLYING") && !decided;

  function confirmAssign(applicationId: string, name: string) {
    modals.openConfirmModal({
      title: `Give ${result.storeCode} to ${name}?`,
      children: (
        <Text size="sm">
          {name} becomes the owner of {result.storeCode} straight away, and every other candidate for this store is
          marked not selected and notified.
        </Text>
      ),
      labels: { confirm: "Assign store", cancel: "Cancel" },
      confirmProps: { color: "teal" },
      onConfirm: () => setWinner.mutate({ id: election.id, storeCode: result.storeCode, applicationId }),
    });
  }

  return (
    <Card withBorder radius="md" padding="sm">
      <Group justify="space-between" mb={result.candidates.length > 0 ? "xs" : 0} wrap="nowrap">
        <div>
          <Text fw={700}>{result.storeCode} <Text span c="dimmed" fw={400}>· {result.storeName}</Text></Text>
          <Text size="xs" c="dimmed">{result.totalVotes} vote{result.totalVotes === 1 ? "" : "s"} cast</Text>
        </div>
        {decided
          ? <Badge color="teal" variant="light">Owner assigned</Badge>
          : result.tied && result.candidates.length > 0
            ? <Badge color="orange" variant="light">Tied — you decide</Badge>
            : null}
      </Group>

      {result.candidates.length === 0 ? (
        <Text size="sm" c="dimmed">Nobody applied for this store.</Text>
      ) : (
        <Stack gap={6}>
          {result.candidates.map((candidate) => {
            const name = candidate.robloxName || candidate.displayName;
            const isWinner = candidate.applicationId === result.winnerApplicationId;
            const isLeader = candidate.applicationId === result.leaderApplicationId;
            return (
              <Group key={candidate.applicationId} justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                  {(isWinner || isLeader) && (
                    <Tooltip label={isWinner ? "Assigned owner" : "Leading"}>
                      <IconCrown size={16} color="var(--mantine-color-yellow-6)" />
                    </Tooltip>
                  )}
                  <Text size="sm" truncate>{name}</Text>
                </Group>
                <Group gap={8} wrap="nowrap">
                  <Badge variant="light" color="grape">{candidate.voteCount}</Badge>
                  {canAssign && (
                    <Button
                      size="compact-xs"
                      variant={isLeader ? "filled" : "light"}
                      color="teal"
                      loading={setWinner.isPending && setWinner.variables?.applicationId === candidate.applicationId}
                      onClick={() => confirmAssign(candidate.applicationId, name)}
                    >
                      Assign
                    </Button>
                  )}
                </Group>
              </Group>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}

function ElectionRow({ election, onEdit }: { election: AdminElection; onEdit: (election: AdminElection) => void }) {
  const action = useElectionAction();
  const finished = election.status === "CLOSED" || election.status === "CANCELLED";
  const results = election.results ?? [];
  const undecided = results.filter((result) => result.winnerApplicationId === null).length;

  function confirm(kind: "close" | "cancel" | "delete", body: string) {
    modals.openConfirmModal({
      title: kind === "close" ? `Close “${election.title}”?` : kind === "cancel" ? `Cancel “${election.title}”?` : "Delete this draft?",
      children: <Text size="sm">{body}</Text>,
      labels: { confirm: kind === "close" ? "Close election" : kind === "cancel" ? "Cancel election" : "Delete draft", cancel: "Back" },
      confirmProps: { color: kind === "close" ? "teal" : "red" },
      onConfirm: () => action.mutate({ id: election.id, action: kind }),
    });
  }

  return (
    <Accordion.Item value={election.id}>
      <Accordion.Control>
        <Group justify="space-between" wrap="wrap" pr="sm">
          <div style={{ minWidth: 0 }}>
            <Group gap="xs">
              <Text fw={700}>{election.title}</Text>
              <Badge color={phaseColor(election.phase)} variant="light">{phaseLabel(election.phase)}</Badge>
            </Group>
            <Text size="xs" c="dimmed">
              {election.stores.length} store{election.stores.length === 1 ? "" : "s"} · {election.applicationCount} application
              {election.applicationCount === 1 ? "" : "s"} · {election.voteCount} vote{election.voteCount === 1 ? "" : "s"}
              {election.nextDeadline && ` · ${phaseLabel(election.phase).toLowerCase()} for another ${timeLeft(election.nextDeadline)}`}
            </Text>
          </div>
          {election.status === "TALLYING" && (
            <Badge color="orange">{undecided > 0 ? `${undecided} store${undecided === 1 ? "" : "s"} to confirm` : "Ready to close"}</Badge>
          )}
        </Group>
      </Accordion.Control>

      <Accordion.Panel>
        <Stack gap="sm">
          {election.note && <Text size="sm" c="dimmed">“{election.note}”</Text>}

          <Table withRowBorders={false} verticalSpacing={2} fz="sm">
            <Table.Tbody>
              <Table.Tr><Table.Td c="dimmed" w={170}>Applications open</Table.Td><Table.Td>{formatDate(election.applicationsOpenAt)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td c="dimmed">Applications close</Table.Td><Table.Td>{formatDate(election.applicationsCloseAt)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td c="dimmed">Voting opens</Table.Td><Table.Td>{formatDate(election.votingOpensAt)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td c="dimmed">Voting closes</Table.Td><Table.Td>{formatDate(election.votingClosesAt)}</Table.Td></Table.Tr>
              {election.closedAt && (
                <Table.Tr><Table.Td c="dimmed">Finished</Table.Td><Table.Td>{formatDate(election.closedAt)}</Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>

          {election.status === "TALLYING" && (
            <Alert color="orange" variant="light">
              Voting is over. Confirm a winner for each store — the leader is highlighted — then close the election.
              Stores you leave unassigned go back to the status they had before.
            </Alert>
          )}

          <Stack gap="xs">
            {results.map((result) => <StoreResults key={result.storeCode} election={election} result={result} />)}
          </Stack>

          {!finished && (
            <Group gap="xs" justify="flex-end">
              <Button variant="default" size="compact-sm" onClick={() => onEdit(election)}>Edit</Button>
              {election.status === "DRAFT" && (
                <>
                  <Button
                    size="compact-sm"
                    loading={action.isPending && action.variables?.action === "publish"}
                    onClick={() => action.mutate({ id: election.id, action: "publish" })}
                  >
                    Publish
                  </Button>
                  <Button
                    size="compact-sm"
                    color="red"
                    variant="light"
                    onClick={() => confirm("delete", "This draft has never been visible to members and will be removed.")}
                  >
                    Delete draft
                  </Button>
                </>
              )}
              {election.status !== "DRAFT" && (
                <>
                  <Button
                    size="compact-sm"
                    color="teal"
                    onClick={() => confirm("close", "Stores with a confirmed winner keep their new owner. Every other store goes back to the status it had before the election, and remaining candidates are marked not selected.")}
                  >
                    Close election
                  </Button>
                  <Button
                    size="compact-sm"
                    color="red"
                    variant="light"
                    onClick={() => confirm("cancel", "Every vote in this election is deleted, applications are cancelled, and each store returns to its previous status. This cannot be undone.")}
                  >
                    Cancel election
                  </Button>
                </>
              )}
            </Group>
          )}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

export function ElectionsPanel() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminElection | null>(null);
  // Phases advance on the server; a slow poll keeps the badges honest.
  const { data: elections, isLoading, isError } = useQuery({
    queryKey: ["adminElections"],
    queryFn: getAdminElections,
    refetchInterval: 60_000,
  });

  const live = (elections ?? []).filter((election) => election.status !== "CLOSED" && election.status !== "CANCELLED");
  const past = (elections ?? []).filter((election) => election.status === "CLOSED" || election.status === "CANCELLED");

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(election: AdminElection) {
    setEditing(election);
    setFormOpen(true);
  }

  return (
    <Card withBorder radius="lg" padding="lg">
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <IconCalendarEvent size={22} />
          <div>
            <Text fw={700} fz="lg">Elections</Text>
            <Text size="sm" c="dimmed">Schedule a round, let it run itself, then confirm the winners.</Text>
          </div>
        </Group>
        <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>New election</Button>
      </Group>

      {isLoading && <Center py="md"><Loader color="grape" size="sm" /></Center>}
      {isError && <Alert color="red">Could not load elections.</Alert>}
      {elections && elections.length === 0 && (
        <Text c="dimmed" size="sm">No elections yet. Create one to put vacant stores up for application and voting.</Text>
      )}

      {live.length > 0 && (
        <Accordion variant="separated" defaultValue={live[0]!.id}>
          {live.map((election) => <ElectionRow key={election.id} election={election} onEdit={openEdit} />)}
        </Accordion>
      )}

      {past.length > 0 && (
        <>
          <Text fw={700} size="sm" c="dimmed" mt="lg" mb="xs">Past elections · {past.length}</Text>
          <Accordion variant="separated">
            {past.map((election) => <ElectionRow key={election.id} election={election} onEdit={openEdit} />)}
          </Accordion>
        </>
      )}

      <ElectionFormModal opened={formOpen} onClose={() => setFormOpen(false)} election={editing} />
    </Card>
  );
}
