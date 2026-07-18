import { useState } from "react";
import { ActionIcon, Badge, Button, Group, Menu, Modal, Table, Text, Textarea, Tooltip } from "@mantine/core";
import { IconCheck, IconDotsVertical, IconDownload, IconRocket, IconTrash, IconX } from "@tabler/icons-react";
import { versionDownloadUrl, type VersionDto } from "../api/client";
import { useDeleteVersion, useReview } from "../api/mutations";
import { formatBytes, formatDate, versionColor, versionIdentifier, versionLabel } from "../utils/format";

export function VersionTable({ code, versions, canManage }: { code: string; versions: VersionDto[]; canManage: boolean }) {
  const review = useReview();
  const remove = useDeleteVersion(code);
  const [declineFor, setDeclineFor] = useState<VersionDto | null>(null);
  const [deleteFor, setDeleteFor] = useState<VersionDto | null>(null);
  const [reason, setReason] = useState("");

  if (versions.length === 0) {
    return <Text c="dimmed" size="sm">No versions submitted yet.</Text>;
  }

  const rows = versions.map((v) => (
    <Table.Tr key={v.id}>
      <Table.Td><Text fw={700} ff="monospace">{versionIdentifier(code, v.versionNumber, v.createdAt)}</Text></Table.Td>
      <Table.Td><Badge color={versionColor(v.status)} variant="light">{versionLabel(v.status)}</Badge></Table.Td>
      <Table.Td>
        <Text size="sm" truncate maw={220} title={v.fileName}>{v.fileName}</Text>
        <Text size="xs" c="dimmed">{formatBytes(v.fileSize)}</Text>
      </Table.Td>
      <Table.Td><Text size="sm">{formatDate(v.createdAt)}</Text></Table.Td>
      <Table.Td>
        {v.note ? <Text size="xs" c="dimmed" maw={220} lineClamp={2}>{v.note}</Text> : <Text size="xs" c="dimmed">—</Text>}
        {v.reviewNote && <Text size="xs" c="red.6" maw={220} lineClamp={2}>Review: {v.reviewNote}</Text>}
      </Table.Td>
      <Table.Td>
        <Group gap={6} justify="flex-end" wrap="nowrap">
          <Tooltip label="Download">
            <ActionIcon component="a" href={versionDownloadUrl(code, v.id)} variant="light" color="grape">
              <IconDownload size={18} />
            </ActionIcon>
          </Tooltip>
          {canManage && (
            <Menu position="bottom-end" withArrow>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray"><IconDotsVertical size={18} /></ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Review actions</Menu.Label>
                <Menu.Item
                  leftSection={<IconCheck size={16} />}
                  disabled={v.status === "APPROVED" || v.status === "PUBLISHED"}
                  onClick={() => review.mutate({ code, id: v.id, action: "approve" })}
                >
                  Approve
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconRocket size={16} />}
                  color="violet"
                  disabled={v.status === "PUBLISHED"}
                  onClick={() => review.mutate({ code, id: v.id, action: "publish" })}
                >
                  Publish to game
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconX size={16} />}
                  color="red"
                  disabled={v.status === "DECLINED" || v.status === "PUBLISHED"}
                  onClick={() => { setDeclineFor(v); setReason(""); }}
                >
                  Decline…
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconTrash size={16} />}
                  color="red"
                  disabled={v.status === "PUBLISHED"}
                  onClick={() => setDeleteFor(v)}
                >
                  Remove file…
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Version</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>File</Table.Th>
              <Table.Th>Uploaded</Table.Th>
              <Table.Th>Notes</Table.Th>
              <Table.Th ta="right">Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal opened={declineFor !== null} onClose={() => setDeclineFor(null)} title={`Decline ${declineFor ? versionIdentifier(code, declineFor.versionNumber, declineFor.createdAt) : ""}`} centered>
        <Textarea
          label="Reason (sent to the owner)"
          placeholder="Explain what needs to change…"
          autosize
          minRows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeclineFor(null)}>Cancel</Button>
          <Button
            color="red"
            loading={review.isPending}
            onClick={() => {
              if (!declineFor) return;
              review.mutate(
                { code, id: declineFor.id, action: "decline", reviewNote: reason.trim() || undefined },
                { onSuccess: () => setDeclineFor(null) },
              );
            }}
          >
            Decline & notify
          </Button>
        </Group>
      </Modal>

      <Modal opened={deleteFor !== null} onClose={() => setDeleteFor(null)} title={`Remove ${deleteFor ? versionIdentifier(code, deleteFor.versionNumber, deleteFor.createdAt) : ""}?`} centered>
        <Text size="sm">This permanently removes the uploaded file and its version history entry. A live file must be replaced before it can be removed.</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeleteFor(null)}>Cancel</Button>
          <Button
            color="red"
            loading={remove.isPending}
            onClick={() => {
              if (!deleteFor) return;
              remove.mutate(deleteFor.id, { onSuccess: () => setDeleteFor(null) });
            }}
          >
            Remove permanently
          </Button>
        </Group>
      </Modal>
    </>
  );
}
