import { useState } from "react";
import {
  ActionIcon, Alert, Anchor, Badge, Button, Card, Center, Container, Group, Loader, Modal, Stack,
  Table, Text, Textarea, Title, Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconCheck, IconDownload, IconEdit, IconInbox, IconPlus, IconRocket, IconTrash, IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  getPending, getStores, versionDownloadUrl, type PendingItem, type StoreSummary,
} from "../api/client";
import { useDeleteStore, useReview } from "../api/mutations";
import { StoreFormModal } from "../components/StoreFormModal";
import { floorLabel, formatBytes, formatDate, storeStatusColor, versionColor, versionIdentifier } from "../utils/format";

function PendingQueue() {
  const { data: pending, isLoading } = useQuery({ queryKey: ["pending"], queryFn: getPending });
  const review = useReview();
  const [declineItem, setDeclineItem] = useState<PendingItem | null>(null);
  const [reason, setReason] = useState("");

  if (isLoading) return <Center py="md"><Loader color="grape" size="sm" /></Center>;

  if (!pending || pending.length === 0) {
    return <Text c="dimmed" size="sm">Nothing in the queue — every submission is live or declined. 🎉</Text>;
  }

  const waiting = pending.filter((p) => p.status === "PENDING");
  const approved = pending.filter((p) => p.status === "APPROVED");

  const renderRow = (p: PendingItem) => (
    <Table.Tr key={p.id}>
      <Table.Td>
        <Anchor component={Link} to={`/stores/${p.storeCode}`} fw={700}>{p.storeCode}</Anchor>
        <Text size="xs" c="dimmed">{p.storeName}</Text>
      </Table.Td>
      <Table.Td><Badge color={versionColor(p.status)} variant="light" ff="monospace">{versionIdentifier(p.storeCode, p.versionNumber, p.createdAt)}</Badge></Table.Td>
      <Table.Td>
        <Text size="sm" truncate maw={200} title={p.fileName}>{p.fileName}</Text>
        <Text size="xs" c="dimmed">{formatBytes(p.fileSize)} · {formatDate(p.createdAt)}</Text>
        {p.note && <Text size="xs" c="dimmed" lineClamp={2} maw={220}>“{p.note}”</Text>}
      </Table.Td>
      <Table.Td>
        <Group gap={6} justify="flex-end" wrap="nowrap">
          <Tooltip label="Download"><ActionIcon component="a" href={versionDownloadUrl(p.storeCode, p.id)} variant="light" color="grape"><IconDownload size={18} /></ActionIcon></Tooltip>
          {p.status === "PENDING" && (
            <Tooltip label="Approve"><ActionIcon color="teal" variant="light" onClick={() => review.mutate({ code: p.storeCode, id: p.id, action: "approve" })}><IconCheck size={18} /></ActionIcon></Tooltip>
          )}
          <Tooltip label="Publish to game"><ActionIcon color="violet" variant="light" onClick={() => review.mutate({ code: p.storeCode, id: p.id, action: "publish" })}><IconRocket size={18} /></ActionIcon></Tooltip>
          <Tooltip label="Decline"><ActionIcon color="red" variant="light" onClick={() => { setDeclineItem(p); setReason(""); }}><IconX size={18} /></ActionIcon></Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );

  const section = (items: PendingItem[], empty: string) =>
    items.length === 0 ? (
      <Text c="dimmed" size="sm">{empty}</Text>
    ) : (
      <Table.ScrollContainer minWidth={620}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Store</Table.Th>
              <Table.Th>Version</Table.Th>
              <Table.Th>File</Table.Th>
              <Table.Th ta="right">Review</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{items.map(renderRow)}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    );

  return (
    <>
      <Stack gap="lg">
        <div>
          <Text fw={700} size="sm" c="yellow.7" mb="xs">Waiting for review · {waiting.length}</Text>
          {section(waiting, "Nothing is waiting for review.")}
        </div>
        <div>
          <Text fw={700} size="sm" c="teal.7" mb="xs">Approved — waiting to publish · {approved.length}</Text>
          {section(approved, "Nothing approved is waiting to be published.")}
        </div>
      </Stack>

      <Modal opened={declineItem !== null} onClose={() => setDeclineItem(null)} title={`Decline ${declineItem ? versionIdentifier(declineItem.storeCode, declineItem.versionNumber, declineItem.createdAt) : ""}`} centered>
        <Textarea label="Reason (sent to the owner)" autosize minRows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeclineItem(null)}>Cancel</Button>
          <Button color="red" loading={review.isPending} onClick={() => {
            if (!declineItem) return;
            review.mutate({ code: declineItem.storeCode, id: declineItem.id, action: "decline", reviewNote: reason.trim() || undefined }, { onSuccess: () => setDeclineItem(null) });
          }}>Decline & notify</Button>
        </Group>
      </Modal>
    </>
  );
}

function StoresTable({ onEdit }: { onEdit: (store: StoreSummary) => void }) {
  const { data: stores, isLoading } = useQuery({ queryKey: ["stores"], queryFn: getStores });
  const del = useDeleteStore();

  if (isLoading) return <Center py="md"><Loader color="grape" size="sm" /></Center>;
  if (!stores) return <Alert color="red">Could not load stores.</Alert>;

  function confirmDelete(store: StoreSummary) {
    modals.openConfirmModal({
      title: `Delete ${store.code}?`,
      children: <Text size="sm">This permanently removes the store, all its versions and templates, and their uploaded files. This cannot be undone.</Text>,
      labels: { confirm: "Delete store", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => del.mutate(store.code),
    });
  }

  const rows = stores.map((s) => (
    <Table.Tr key={s.code}>
      <Table.Td><Anchor component={Link} to={`/stores/${s.code}`} fw={700}>{s.code}</Anchor></Table.Td>
      <Table.Td><Badge variant="light" color="blue">{floorLabel(s.floor)}</Badge></Table.Td>
      <Table.Td>
        <Badge color={storeStatusColor(s.status, s.statusLabel)} variant={s.status === "CLOSED" ? "outline" : "light"}>
          {s.status === "CLOSED" ? "Closed" : s.statusLabel}
        </Badge>
      </Table.Td>
      <Table.Td><Text size="sm">{s.ownerDisplayName || (s.ownerDiscordId ? "Roblox account not linked" : <Text span c="dimmed">Unassigned</Text>)}</Text></Table.Td>
      <Table.Td>{s.currentVersion ? <Badge color="violet" variant="light" ff="monospace">{versionIdentifier(s.code, s.currentVersion.versionNumber, s.currentVersion.createdAt)}</Badge> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
      <Table.Td>
        <Group gap={6} justify="flex-end" wrap="nowrap">
          <Tooltip label="Edit"><ActionIcon variant="light" color="grape" onClick={() => onEdit(s)}><IconEdit size={18} /></ActionIcon></Tooltip>
          <Tooltip label="Delete"><ActionIcon variant="light" color="red" onClick={() => confirmDelete(s)}><IconTrash size={18} /></ActionIcon></Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Table.ScrollContainer minWidth={720}>
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Code</Table.Th>
            <Table.Th>Floor</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Owner</Table.Th>
            <Table.Th>Live</Table.Th>
            <Table.Th ta="right">Manage</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export function AdminPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editStore, setEditStore] = useState<StoreSummary | null>(null);

  function openCreate() {
    setEditStore(null);
    setFormOpen(true);
  }
  function openEdit(store: StoreSummary) {
    setEditStore(store);
    setFormOpen(true);
  }

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="lg" wrap="wrap">
        <div>
          <Title order={2}>Admin dashboard</Title>
          <Text c="dimmed">Review submissions and manage every store in the mall.</Text>
        </div>
        <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>New store</Button>
      </Group>

      <Stack gap="lg">
        <Card withBorder radius="lg" padding="lg">
          <Group gap="sm" mb="md">
            <IconInbox size={22} />
            <Text fw={700} fz="lg">Review queue</Text>
          </Group>
          <PendingQueue />
        </Card>

        <Card withBorder radius="lg" padding="lg">
          <Text fw={700} fz="lg" mb="md">All stores</Text>
          <StoresTable onEdit={openEdit} />
        </Card>
      </Stack>

      <StoreFormModal opened={formOpen} onClose={() => setFormOpen(false)} store={editStore} />
    </Container>
  );
}
