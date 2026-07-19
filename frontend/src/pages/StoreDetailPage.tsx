import { Fragment } from "react";
import {
  Alert, Anchor, Badge, Button, Card, Center, Container, Divider, FileButton, Group, Loader,
  SimpleGrid, Stack, Text, ThemeIcon,
} from "@mantine/core";
import {
  IconArrowLeft, IconBox, IconCheck, IconClock, IconDownload, IconFileDownload, IconMapPin,
  IconRuler2, IconRocket, IconTemplate, IconTrash, IconUpload, IconUserCheck, IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  currentDownloadUrl, getStore, templateDownloadUrl, type TemplateDto, type VersionDto,
} from "../api/client";
import { useDeleteTemplate, useUploadTemplate } from "../api/mutations";
import { RoomDiagram, studs } from "../components/RoomDiagram";
import { UploadCard } from "../components/UploadCard";
import { VersionTable } from "../components/VersionTable";
import { DOOR, ROOM_HEIGHT, floorArea, shapeLabel, WALL_LABELS, type RoomSpec } from "../utils/room";
import { floorLabel, formatBytes, formatDate, storeStatusColor, versionIdentifier } from "../utils/format";

const ACCEPTED = [".rbxl", ".rbxlx"];
const okExt = (name: string) => ACCEPTED.some((e) => name.toLowerCase().endsWith(e));

function CurrentFileCard({
  code,
  current,
  canDownload,
}: {
  code: string;
  current: { versionNumber: number; fileName: string; fileSize: number; createdAt: string } | null;
  canDownload: boolean;
}) {
  return (
    <Card withBorder radius="lg" padding="lg" h="100%">
      <Group gap="sm" mb="sm">
        <ThemeIcon size={38} radius="md" variant="light" color="violet"><IconBox size={22} /></ThemeIcon>
        <Text fw={700} fz="lg">Current live file</Text>
      </Group>
      {current ? (
        <Stack gap={6}>
          <Group gap="xs">
            <Badge color="violet" size="lg" ff="monospace">{versionIdentifier(code, current.versionNumber, current.createdAt)}</Badge>
            <Text size="sm" truncate title={current.fileName}>{current.fileName}</Text>
          </Group>
          <Text size="xs" c="dimmed">{formatBytes(current.fileSize)} · published {formatDate(current.createdAt)}</Text>
          {canDownload ? (
            <Button mt="sm" component="a" href={currentDownloadUrl(code)} leftSection={<IconDownload size={18} />} variant="light" color="violet">
              Download current file
            </Button>
          ) : <Text size="xs" c="dimmed" mt="sm">Members can view the live-file details, but only this store's owner or a game owner can download it.</Text>}
        </Stack>
      ) : (
        <Text c="dimmed" size="sm">No file has been published to the game yet.</Text>
      )}
    </Card>
  );
}

function TemplateCard({ code, templates, canManage }: { code: string; templates: TemplateDto[]; canManage: boolean }) {
  const upload = useUploadTemplate();
  const remove = useDeleteTemplate(code);

  return (
    <Card withBorder radius="lg" padding="lg" h="100%">
      <Group gap="sm" mb="sm" justify="space-between">
        <Group gap="sm">
          <ThemeIcon size={38} radius="md" variant="light" color="teal"><IconTemplate size={22} /></ThemeIcon>
          <Text fw={700} fz="lg">Template file</Text>
        </Group>
        {canManage && (
          <FileButton onChange={(file) => file && okExt(file.name) && upload.mutate({ code, file })} accept={ACCEPTED.join(",")}>
            {(props) => <Button {...props} size="compact-sm" variant="light" leftSection={<IconUpload size={16} />} loading={upload.isPending}>Upload</Button>}
          </FileButton>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb="sm">A starting point for building your store.</Text>
      {templates.length === 0 ? (
        <Text c="dimmed" size="sm">No template available yet.</Text>
      ) : (
        <Stack gap="xs">
          {templates.map((t) => (
            <Group key={t.id} justify="space-between" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Group gap={6} wrap="nowrap">
                  <Anchor href={templateDownloadUrl(code, t.id)} size="sm" truncate title={t.fileName}>{t.fileName}</Anchor>
                  {t.storeCode === null && <Badge size="xs" variant="outline" color="gray">Global</Badge>}
                </Group>
                <Text size="xs" c="dimmed">{formatBytes(t.fileSize)} · {formatDate(t.createdAt)}</Text>
              </div>
              <Group gap={4} wrap="nowrap">
                <Button component="a" href={templateDownloadUrl(code, t.id)} size="compact-sm" variant="subtle" leftSection={<IconFileDownload size={16} />}>
                  Get
                </Button>
                {canManage && (
                  <Button color="red" variant="subtle" size="compact-sm" onClick={() => remove.mutate(t.id)} loading={remove.isPending}>
                    <IconTrash size={16} />
                  </Button>
                )}
              </Group>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  );
}

/** The physical unit the owner is building into, so their .rbxl fits the space. */
function RoomCard({ room }: { room: RoomSpec }) {
  const facts = [
    ["Floor", `${shapeLabel(room)} · ${studs(room.width)} × ${studs(room.depth)} studs · ${floorArea(room).toLocaleString()} studs²`],
    ["Wall height", `${studs(ROOM_HEIGHT)} studs`],
    ["Doorway", `${WALL_LABELS[DOOR.wall]} wall · ${studs(DOOR.width)} × ${studs(DOOR.height)} studs, ${studs(room.doorOffset)} from the corner`],
    ["Windows", room.windows.length === 0 ? "None" : `${room.windows.length} on the ${[...new Set(room.windows.map((w) => WALL_LABELS[w.wall].toLowerCase()))].join(", ")} wall${room.windows.length === 1 ? "" : "s"}`],
  ] as const;

  return (
    <Card withBorder radius="lg" padding="lg">
      <Group gap="sm" mb="sm">
        <ThemeIcon size={38} radius="md" variant="light" color="grape"><IconRuler2 size={22} /></ThemeIcon>
        <div>
          <Text fw={700} fz="lg">Your unit</Text>
          <Text size="xs" c="dimmed">All measurements are in studs.</Text>
        </div>
      </Group>
      <RoomDiagram room={room} height={340} />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" mt="md">
        {facts.map(([label, value]) => (
          <Group key={label} gap={6} wrap="nowrap">
            <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>{label}:</Text>
            <Text size="sm" fw={600}>{value}</Text>
          </Group>
        ))}
      </SimpleGrid>
    </Card>
  );
}

const PROGRESS_STEPS = ["Uploaded", "In review", "Approved", "Live"] as const;

// Which step the submission currently sits at (0-based index into PROGRESS_STEPS).
function currentStep(status: VersionDto["status"]): number {
  switch (status) {
    case "PENDING": return 1; // uploaded, now in review
    case "APPROVED": return 2;
    case "PUBLISHED": return 3;
    default: return 1;
  }
}

/** Owner-facing pipeline for the latest in-flight submission. */
function SubmissionProgress({ code, version }: { code: string; version: VersionDto }) {
  const identifier = versionIdentifier(code, version.versionNumber, version.createdAt);

  if (version.status === "DECLINED") {
    return (
      <Card withBorder radius="lg" padding="lg">
        <Group gap="sm" mb={6}>
          <ThemeIcon color="red" variant="light" radius="md" size={34}><IconX size={20} /></ThemeIcon>
          <div>
            <Text fw={700} fz="lg">Latest submission declined</Text>
            <Text size="sm" c="dimmed">
              <Text span ff="monospace">{identifier}</Text> was declined — upload a new file to try again.
            </Text>
          </div>
        </Group>
        {version.reviewNote && <Text size="sm" c="red.6" mt={4}>Reason: {version.reviewNote}</Text>}
      </Card>
    );
  }

  const active = currentStep(version.status);
  const live = version.status === "PUBLISHED";

  return (
    <Card withBorder radius="lg" padding="lg">
      <Group justify="space-between" mb="lg" wrap="wrap" gap="xs">
        <Text fw={700} fz="lg">Submission progress</Text>
        <Text size="sm" c="dimmed" ff="monospace">{identifier}</Text>
      </Group>
      <Group gap={0} wrap="nowrap" align="flex-start">
        {PROGRESS_STEPS.map((label, i) => {
          const done = i < active;
          const isCurrent = i === active;
          const reached = i <= active;
          const icon = done ? <IconCheck size={18} /> : isCurrent
            ? (live ? <IconRocket size={18} /> : <IconClock size={18} />)
            : <Text fz="sm" fw={700}>{i + 1}</Text>;
          return (
            <Fragment key={label}>
              {i > 0 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    marginTop: 17,
                    background: reached
                      ? "var(--mantine-color-violet-6)"
                      : "var(--mantine-color-default-border)",
                  }}
                />
              )}
              <Stack gap={6} align="center" style={{ width: 76 }}>
                <ThemeIcon
                  radius="xl"
                  size={36}
                  variant={reached ? "filled" : "light"}
                  color={reached ? "violet" : "gray"}
                >
                  {icon}
                </ThemeIcon>
                <Text size="xs" fw={isCurrent ? 700 : 500} c={reached ? undefined : "dimmed"} ta="center">
                  {label}
                </Text>
              </Stack>
            </Fragment>
          );
        })}
      </Group>
    </Card>
  );
}

export function StoreDetailPage() {
  const { code = "" } = useParams();
  const { data: store, isLoading, isError } = useQuery({ queryKey: ["store", code], queryFn: () => getStore(code) });

  if (isLoading) return <Center py="xl"><Loader color="grape" /></Center>;
  if (isError || !store) {
    return (
      <Container size="lg" py="xl">
        <Button component={Link} to="/stores" variant="subtle" leftSection={<IconArrowLeft size={18} />} mb="md">Back to stores</Button>
        <Alert color="red">This store could not be loaded, or you don't have access to it.</Alert>
      </Container>
    );
  }

  const canUpload = store.isOwner || store.canManage;
  // Newest submission (versions come ordered newest-first); show the pipeline while
  // it is still moving toward the game — i.e. not already the published live file.
  const latest = store.versions[0];
  const inFlight = latest && ["PENDING", "APPROVED", "DECLINED"].includes(latest.status) ? latest : null;

  return (
    <Container size="lg" py="xl">
      <Button component={Link} to="/stores" variant="subtle" leftSection={<IconArrowLeft size={18} />} mb="md">Back to stores</Button>

      <Stack gap="lg">
        <Card withBorder radius="md" padding="lg">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Group gap="md" align="center">
              <Text fw={900} fz={44} lh={1}>{store.code}</Text>
              <Stack gap={4}>
                <Text fw={700} fz="xl">{store.displayName}</Text>
                <Group gap="xs">
                  <Badge variant="light" color="blue" leftSection={<IconMapPin size={12} />}>{floorLabel(store.floor)}</Badge>
                  <Badge color={storeStatusColor(store.status, store.statusLabel)} variant={store.status === "CLOSED" ? "outline" : "filled"}>
                    {store.status === "CLOSED" ? "Closed" : store.status === "ELECTION" ? "Election in progress" : store.statusLabel}
                  </Badge>
                  {store.isOwner && (
                    <Badge color="teal" variant="light" leftSection={<IconUserCheck size={12} />}>
                      Your store
                    </Badge>
                  )}
                </Group>
              </Stack>
            </Group>
            <Stack gap={2} ta="right">
              <Text size="sm" c="dimmed">Owner: {store.ownerDisplayName || (store.ownerDiscordId ? "Roblox account not linked" : "Unassigned")}</Text>
              {store.storeIdentifier && <Text size="xs" ff="monospace" c="dimmed">ID: {store.storeIdentifier}</Text>}
            </Stack>
          </Group>
        </Card>

        {inFlight && <SubmissionProgress code={store.code} version={inFlight} />}

        {store.room && <RoomCard room={store.room} />}

        {store.canViewRestrictedFiles ? (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            <CurrentFileCard code={store.code} current={store.currentVersion} canDownload={store.canDownloadCurrent} />
            <TemplateCard code={store.code} templates={store.templates} canManage={store.canManage} />
          </SimpleGrid>
        ) : <CurrentFileCard code={store.code} current={store.currentVersion} canDownload={false} />}

        {canUpload && <UploadCard code={store.code} disabled={store.status !== "OPEN"} />}

        {store.canViewRestrictedFiles && (
          <Card withBorder radius="lg" padding="lg">
            <Divider label={<Text fw={700}>Version history</Text>} labelPosition="left" mb="md" />
            <VersionTable code={store.code} versions={store.versions} canManage={store.canManage} />
          </Card>
        )}
      </Stack>
    </Container>
  );
}
