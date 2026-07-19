import {
  ActionIcon, Badge, Button, Card, Divider, Group, NumberInput, Paper, Select, Stack, Switch, Text,
} from "@mantine/core";
import { IconPlus, IconTrash, IconWindow } from "@tabler/icons-react";
import { RoomDiagram, studs } from "./RoomDiagram";
import {
  LIMITS, MAX_WINDOWS, ROOM_HEIGHT, WALLS, WALL_LABELS, defaultRoom, defaultWindow,
  floorArea, maxDoorOffset, shapeLabel, validateRoom,
  type RoomSpec, type RoomWindow, type Wall,
} from "../utils/room";

const wallOptions = WALLS.map((w) => ({ value: w, label: `${WALL_LABELS[w]} wall` }));

/** NumberInput tuned for stud values: half-stud steps, no thousands separator. */
function StudInput({
  label, value, onChange, error, min = 0, max = 500,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  error?: string;
  min?: number;
  max?: number;
}) {
  return (
    <NumberInput
      label={label}
      value={value}
      onChange={(v) => onChange(typeof v === "number" ? v : Number(v) || 0)}
      error={error}
      min={min}
      max={max}
      step={0.5}
      decimalScale={1}
      clampBehavior="strict"
    />
  );
}

export function RoomLayoutFields({
  room,
  onChange,
}: {
  room: RoomSpec | null;
  onChange: (room: RoomSpec | null) => void;
}) {
  const { errors } = validateRoom(room ?? defaultRoom());

  if (!room) {
    return (
      <Card withBorder radius="md" padding="md" bg="var(--mantine-color-default-hover)">
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text fw={700} size="sm">Room layout</Text>
            <Text size="xs" c="dimmed">Show the owner a diagram of their unit.</Text>
          </div>
          <Switch checked={false} onChange={() => onChange(defaultRoom())} aria-label="Add a room layout" />
        </Group>
      </Card>
    );
  }

  const set = (patch: Partial<RoomSpec>) => onChange({ ...room, ...patch });
  const setWindow = (index: number, patch: Partial<RoomWindow>) =>
    set({ windows: room.windows.map((w, i) => (i === index ? { ...w, ...patch } : w)) });

  // Narrowing the unit can strand the doorway past the end of the wall, so pull
  // it back rather than leaving the admin stuck on an error.
  const setWidth = (width: number) =>
    set({ width, doorOffset: Math.min(room.doorOffset, maxDoorOffset(width)) });

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" wrap="nowrap" mb="sm">
        <div>
          <Group gap={8}>
            <Text fw={700} size="sm">Room layout</Text>
            <Badge size="xs" variant="light" color="grape">{shapeLabel(room)}</Badge>
          </Group>
          <Text size="xs" c="dimmed">
            {studs(room.width)} × {studs(room.depth)} studs · {floorArea(room).toLocaleString()} studs² floor
          </Text>
        </div>
        <Switch checked onChange={() => onChange(null)} aria-label="Remove the room layout" />
      </Group>

      <Stack gap="sm">
        <Group grow align="flex-start" gap="xs">
          <StudInput
            label="Width"
            value={room.width}
            error={errors.width}
            min={LIMITS.width.min}
            max={LIMITS.width.max}
            onChange={setWidth}
          />
          <StudInput
            label="Depth"
            value={room.depth}
            error={errors.depth}
            min={LIMITS.depth.min}
            max={LIMITS.depth.max}
            onChange={(v) => set({ depth: v })}
          />
          <StudInput
            label="Door from corner"
            value={room.doorOffset}
            error={errors.doorOffset}
            min={0}
            max={maxDoorOffset(room.width)}
            onChange={(v) => set({ doorOffset: v })}
          />
        </Group>
        <Divider
          labelPosition="left"
          label={
            <Group gap={6}>
              <IconWindow size={15} />
              <Text size="xs" fw={700}>Windows ({room.windows.length})</Text>
            </Group>
          }
        />
        {room.windows.length === 0 && (
          <Text size="xs" c="dimmed">No windows added.</Text>
        )}
        {room.windows.map((win, i) => (
          <Paper key={i} withBorder radius="sm" p="xs">
            <Group justify="space-between" mb={4}>
              <Text size="xs" fw={700} c="dimmed">Window {i + 1}</Text>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                aria-label={`Remove window ${i + 1}`}
                onClick={() => set({ windows: room.windows.filter((_, index) => index !== i) })}
              >
                <IconTrash size={15} />
              </ActionIcon>
            </Group>
            <Group grow align="flex-start" gap="xs">
              <Select
                label="Wall"
                data={wallOptions}
                value={win.wall}
                allowDeselect={false}
                onChange={(v) => v && setWindow(i, { wall: v as Wall })}
              />
              <StudInput
                label="From corner"
                value={win.offset}
                error={errors.windows[i]?.offset}
                onChange={(v) => setWindow(i, { offset: v })}
              />
              <StudInput
                label="Width"
                value={win.width}
                error={errors.windows[i]?.width}
                min={0.5}
                onChange={(v) => setWindow(i, { width: v })}
              />
              <StudInput
                label="Height"
                value={win.height}
                error={errors.windows[i]?.height}
                min={0.5}
                max={ROOM_HEIGHT}
                onChange={(v) => setWindow(i, { height: v })}
              />
              <StudInput
                label="Sill"
                value={win.sill}
                error={errors.windows[i]?.sill}
                max={ROOM_HEIGHT}
                onChange={(v) => setWindow(i, { sill: v })}
              />
            </Group>
          </Paper>
        ))}
        {room.windows.length < MAX_WINDOWS && (
          <Button
            variant="light"
            size="compact-sm"
            leftSection={<IconPlus size={15} />}
            onClick={() => set({ windows: [...room.windows, defaultWindow(room)] })}
          >
            Add window
          </Button>
        )}

        <Paper withBorder radius="md" p="xs" bg="var(--mantine-color-default-hover)">
          <RoomDiagram room={room} height={260} />
        </Paper>
        <Text size="xs" c="dimmed" ta="center">Live preview</Text>
      </Stack>
    </Card>
  );
}
