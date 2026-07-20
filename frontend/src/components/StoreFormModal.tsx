import { useEffect, useState } from "react";
import { Button, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { getVerifiedMembers, type StoreStatus, type StoreSummary } from "../api/client";
import { useCreateStore, useUpdateStore } from "../api/mutations";
import { RoomLayoutFields } from "./RoomLayoutFields";
import { validateRoom, type RoomSpec } from "../utils/room";

interface FormState {
  code: string;
  status: StoreStatus;
  ownerDiscordId: string;
  initialVersion: string;
  creationDate: string;
  room: RoomSpec | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function identifierPreview(code: string, version: number, date: string): string | null {
  if (!code.trim() || !Number.isInteger(version) || version < 1 || version > 999 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${code.trim().toUpperCase()}.${String(version).padStart(3, "0")}.${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`;
}

function initialState(store: StoreSummary | null): FormState {
  return {
    code: store?.code ?? "",
    status: store?.status ?? "OPEN",
    ownerDiscordId: store?.ownerDiscordId ?? "",
    initialVersion: "1",
    creationDate: today(),
    room: store?.room ?? null,
  };
}

export function StoreFormModal({
  opened,
  onClose,
  store,
}: {
  opened: boolean;
  onClose: () => void;
  store: StoreSummary | null; // null = create
}) {
  const isEdit = store !== null;
  const [form, setForm] = useState<FormState>(initialState(store));
  const create = useCreateStore();
  const update = useUpdateStore();
  const pending = create.isPending || update.isPending;
  const verifiedMembers = useQuery({
    queryKey: ["verifiedMembers"],
    queryFn: getVerifiedMembers,
    enabled: opened,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (opened) setForm(initialState(store));
  }, [opened, store]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const codeError = !isEdit && form.code && !/^[A-Za-z0-9_-]{1,16}$/.test(form.code) ? "1–16 letters, digits, - or _" : null;
  const version = Number(form.initialVersion);
  const needsIdentifier = !store?.storeIdentifier;
  const identifierVersionError = needsIdentifier && (!/^\d+$/.test(form.initialVersion) || version < 1 || version > 999)
    ? "Use a number from 1 to 999"
    : null;
  const creationDateError = needsIdentifier && !/^\d{4}-\d{2}-\d{2}$/.test(form.creationDate) ? "Choose a creation date" : null;
  const preview = needsIdentifier ? identifierPreview(form.code, version, form.creationDate) : null;
  const ownerOptions = (verifiedMembers.data ?? []).map((member) => ({
    value: member.discordId,
    label: member.robloxUsername ? `${member.robloxUsername} · ${member.discordName}` : member.discordName,
  }));
  if (form.ownerDiscordId && !ownerOptions.some((option) => option.value === form.ownerDiscordId)) {
    ownerOptions.push({
      value: form.ownerDiscordId,
      label: store?.ownerDisplayName ? `${store.ownerDisplayName} · no longer verified` : "Current assignment · no longer verified",
    });
  }
  // Election is not a status an admin sets by hand — a scheduled round owns it.
  const inElection = store?.status === "ELECTION";

  function submit() {
    const payload = inElection
      ? { room: form.room }
      : { status: form.status, ownerDiscordId: form.ownerDiscordId || null, room: form.room };
    if (isEdit) {
      update.mutate({
        code: store.code,
        input: needsIdentifier ? { ...payload, initialVersion: version, creationDate: form.creationDate } : payload,
      }, { onSuccess: onClose });
    } else {
      create.mutate({
        code: form.code.trim().toUpperCase(),
        ...payload,
        initialVersion: version,
        creationDate: form.creationDate,
      }, { onSuccess: onClose });
    }
  }

  const roomValid = form.room === null || validateRoom(form.room).valid;
  const canSubmit = (isEdit || (form.code.trim() && !codeError)) && !identifierVersionError && !creationDateError && roomValid && !pending;

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? `Edit ${store.code}` : "Create a new store"} centered size="lg">
      <Stack gap="sm">
        <TextInput
          label="Store code"
          placeholder="A1"
          value={form.code}
          disabled={isEdit}
          error={codeError}
          description="Floor and name are set from the code."
          onChange={(e) => set("code", e.currentTarget.value)}
        />
        <div>
          <SegmentedControl
            fullWidth
            value={inElection ? "ELECTION" : form.status}
            disabled={inElection}
            onChange={(v) => set("status", v as StoreStatus)}
            data={inElection
              ? [{ label: "In an election", value: "ELECTION" }]
              : [{ label: "Open", value: "OPEN" }, { label: "Closed", value: "CLOSED" }]}
          />
          {inElection && (
            <Text size="xs" c="dimmed" mt={6}>
              This store is being contested. Close or cancel its election to change the status or owner.
            </Text>
          )}
        </div>
        <Select
          label="Store owner"
          placeholder={verifiedMembers.isLoading ? "Loading verified members…" : "Choose a verified member"}
          value={inElection ? null : form.ownerDiscordId || null}
          data={ownerOptions}
          searchable
          clearable
          disabled={inElection}
          nothingFoundMessage={verifiedMembers.isLoading ? "Loading verified members…" : "No verified members found"}
          description={inElection ? "The winner of the election becomes the owner." : "Only Bloxlink-verified members can be assigned."}
          onChange={(value) => set("ownerDiscordId", value ?? "")}
        />
        {verifiedMembers.isError && <Text size="xs" c="red">Verified members could not be loaded. You can still remove the current assignment.</Text>}
        {needsIdentifier && (
          <>
            <TextInput
              label="Version"
              type="number"
              min={1}
              max={999}
              value={form.initialVersion}
              error={identifierVersionError}
              description="Starting version number, for example 1."
              onChange={(e) => set("initialVersion", e.currentTarget.value)}
            />
            <TextInput
              label="Date of creation"
              type="date"
              value={form.creationDate}
              error={creationDateError}
              onChange={(e) => set("creationDate", e.currentTarget.value)}
            />
            {preview && <Text size="xs" c="dimmed">Identifier to create: {preview}</Text>}
          </>
        )}

        <RoomLayoutFields room={form.room} onChange={(room) => set("room", room)} />

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={pending} disabled={!canSubmit}>{isEdit ? "Save changes" : "Create store"}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
