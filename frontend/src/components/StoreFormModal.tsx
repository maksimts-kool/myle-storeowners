import { useEffect, useState } from "react";
import { Button, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { getVerifiedMembers, type StoreStatus, type StoreSummary } from "../api/client";
import { useCreateStore, useUpdateStore } from "../api/mutations";

interface FormState {
  code: string;
  status: StoreStatus;
  ownerDiscordId: string;
  initialVersion: string;
  creationDate: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function initialState(store: StoreSummary | null): FormState {
  return {
    code: store?.code ?? "",
    status: store?.status ?? "OPEN",
    ownerDiscordId: store?.ownerDiscordId ?? "",
    initialVersion: "1",
    creationDate: today(),
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
  const versionError = !isEdit && (!/^\d+$/.test(form.initialVersion) || version < 1 || version > 999)
    ? "Use a number from 1 to 999"
    : null;
  const creationDateError = !isEdit && !/^\d{4}-\d{2}-\d{2}$/.test(form.creationDate) ? "Choose a creation date" : null;
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

  function submit() {
    const payload = {
      status: form.status,
      ownerDiscordId: form.ownerDiscordId || null,
    };
    if (isEdit) {
      update.mutate({ code: store.code, input: payload }, { onSuccess: onClose });
    } else {
      create.mutate({
        code: form.code.trim().toUpperCase(),
        ...payload,
        initialVersion: version,
        creationDate: form.creationDate,
      }, { onSuccess: onClose });
    }
  }

  const canSubmit = (isEdit || (form.code.trim() && !codeError && !versionError && !creationDateError)) && !pending;

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? `Edit ${store.code}` : "Create a new store"} centered>
      <Stack gap="sm">
        <TextInput
          label="Store code"
          placeholder="A1"
          value={form.code}
          disabled={isEdit}
          error={codeError}
          description="Floor and display name are set automatically from the code."
          onChange={(e) => set("code", e.currentTarget.value)}
        />
        <div>
          <SegmentedControl
            fullWidth
            value={form.status}
            onChange={(v) => set("status", v as StoreStatus)}
            data={[{ label: "Open", value: "OPEN" }, { label: "Closed", value: "CLOSED" }]}
          />
        </div>
        <Select
          label="Store owner"
          placeholder={verifiedMembers.isLoading ? "Loading verified members…" : "Choose a verified member"}
          value={form.ownerDiscordId || null}
          data={ownerOptions}
          searchable
          clearable
          nothingFoundMessage={verifiedMembers.isLoading ? "Loading verified members…" : "No verified members found"}
          description="Only members verified with Bloxlink in the bot's Discord server can be assigned."
          onChange={(value) => set("ownerDiscordId", value ?? "")}
        />
        {verifiedMembers.isError && <Text size="xs" c="red">Verified members could not be loaded. You can still remove the current assignment.</Text>}
        {!isEdit && (
          <>
            <TextInput
              label="Version"
              type="number"
              min={1}
              max={999}
              value={form.initialVersion}
              error={versionError}
              description="Used to create the initial identifier, for example 001. The next upload continues from the following version."
              onChange={(e) => set("initialVersion", e.currentTarget.value)}
            />
            <TextInput
              label="Date of creation"
              type="date"
              value={form.creationDate}
              error={creationDateError}
              description="Together with the code and version, this creates the store identifier automatically."
              onChange={(e) => set("creationDate", e.currentTarget.value)}
            />
          </>
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={pending} disabled={!canSubmit}>{isEdit ? "Save changes" : "Create store"}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
