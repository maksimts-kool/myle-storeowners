import { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, MultiSelect, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { getAvailableElectionStores, type AdminElection } from "../api/client";
import { useCreateElection, useUpdateElection } from "../api/mutations";
import { floorLabel } from "../utils/format";

interface FormState {
  title: string;
  note: string;
  storeCodes: string[];
  applicationsOpenAt: string;
  applicationsCloseAt: string;
  votingOpensAt: string;
  votingClosesAt: string;
}

/** `datetime-local` speaks local wall-clock time; the API speaks ISO/UTC. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

function plusDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Applications for the first half of the round, voting for the second. */
function scheduleFrom(start: Date, days: number): Pick<FormState, "applicationsOpenAt" | "applicationsCloseAt" | "votingOpensAt" | "votingClosesAt"> {
  const half = plusDays(start, days / 2);
  return {
    applicationsOpenAt: toLocalInput(start),
    applicationsCloseAt: toLocalInput(half),
    votingOpensAt: toLocalInput(half),
    votingClosesAt: toLocalInput(plusDays(start, days)),
  };
}

function nextHour(): Date {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  return new Date(date.getTime() + 60 * 60 * 1000);
}

function initialState(election: AdminElection | null): FormState {
  if (!election) {
    return { title: "", note: "", storeCodes: [], ...scheduleFrom(nextHour(), 14) };
  }
  return {
    title: election.title,
    note: election.note ?? "",
    storeCodes: election.stores.map((store) => store.code),
    applicationsOpenAt: toLocalInput(new Date(election.applicationsOpenAt)),
    applicationsCloseAt: toLocalInput(new Date(election.applicationsCloseAt)),
    votingOpensAt: toLocalInput(new Date(election.votingOpensAt)),
    votingClosesAt: toLocalInput(new Date(election.votingClosesAt)),
  };
}

export function ElectionFormModal({
  opened,
  onClose,
  election,
}: {
  opened: boolean;
  onClose: () => void;
  election: AdminElection | null; // null = create
}) {
  const isEdit = election !== null;
  const [form, setForm] = useState<FormState>(initialState(election));
  const create = useCreateElection();
  const update = useUpdateElection();
  const pending = create.isPending || update.isPending;
  // Once applications can arrive the contested stores are fixed.
  const storesLocked = isEdit && election.status !== "DRAFT" && election.status !== "SCHEDULED";

  const available = useQuery({
    queryKey: ["availableElectionStores"],
    queryFn: getAvailableElectionStores,
    enabled: opened,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (opened) setForm(initialState(election));
  }, [opened, election]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const storeOptions = [
    ...(available.data ?? []).map((store) => ({
      value: store.code,
      label: `${store.code} · ${store.displayName} · ${floorLabel(store.floor)}`,
    })),
    // Stores already attached to this round are not "available" any more.
    ...(election?.stores ?? [])
      .filter((store) => !(available.data ?? []).some((candidate) => candidate.code === store.code))
      .map((store) => ({ value: store.code, label: `${store.code} · ${store.displayName}` })),
  ];

  const times = {
    applicationsOpenAt: new Date(form.applicationsOpenAt),
    applicationsCloseAt: new Date(form.applicationsCloseAt),
    votingOpensAt: new Date(form.votingOpensAt),
    votingClosesAt: new Date(form.votingClosesAt),
  };
  const anyInvalid = Object.values(times).some((date) => Number.isNaN(date.getTime()));
  const windowError = anyInvalid
    ? "Fill in all four dates"
    : times.applicationsCloseAt <= times.applicationsOpenAt
      ? "Applications must close after they open"
      : times.votingClosesAt <= times.votingOpensAt
        ? "Voting must close after it opens"
        : times.votingOpensAt < times.applicationsOpenAt
          ? "Voting cannot open before applications do"
          : times.votingClosesAt < times.applicationsCloseAt
            ? "Voting cannot close before applications do"
            : null;
  const canSubmit = form.title.trim() !== "" && form.storeCodes.length > 0 && !windowError && !pending;

  function payload() {
    return {
      title: form.title.trim(),
      note: form.note.trim() || undefined,
      storeCodes: form.storeCodes,
      applicationsOpenAt: fromLocalInput(form.applicationsOpenAt),
      applicationsCloseAt: fromLocalInput(form.applicationsCloseAt),
      votingOpensAt: fromLocalInput(form.votingOpensAt),
      votingClosesAt: fromLocalInput(form.votingClosesAt),
    };
  }

  function submit(publish: boolean) {
    if (isEdit) {
      const { storeCodes, ...rest } = payload();
      update.mutate({ id: election.id, input: storesLocked ? rest : { ...rest, storeCodes } }, { onSuccess: onClose });
    } else {
      create.mutate({ ...payload(), publish }, { onSuccess: onClose });
    }
  }

  const dateField = (label: string, key: keyof FormState, description: string) => (
    <TextInput
      label={label}
      description={description}
      type="datetime-local"
      value={form[key] as string}
      onChange={(e) => set(key, e.currentTarget.value as FormState[typeof key])}
    />
  );

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? `Edit “${election.title}”` : "New election"} centered size="lg">
      <Stack gap="sm">
        <TextInput
          label="Title"
          placeholder="Second floor elections"
          value={form.title}
          onChange={(e) => set("title", e.currentTarget.value)}
        />
        <MultiSelect
          label="Stores to be elected"
          placeholder={form.storeCodes.length === 0 ? "Choose one or more stores" : undefined}
          data={storeOptions}
          value={form.storeCodes}
          disabled={storesLocked}
          searchable
          clearable
          description={storesLocked
            ? "The store list is fixed once the election has started."
            : "Only stores without an owner and not already in another election."}
          nothingFoundMessage={available.isLoading ? "Loading stores…" : "No free stores left"}
          onChange={(value) => set("storeCodes", value)}
        />

        {!isEdit && (
          <Group gap="xs">
            <Text size="xs" c="dimmed">Quick schedule:</Text>
            {[
              { label: "2 days", days: 2 },
              { label: "1 week", days: 7 },
              { label: "2 weeks", days: 14 },
            ].map((preset) => (
              <Button
                key={preset.days}
                size="compact-xs"
                variant="light"
                onClick={() => setForm((f) => ({ ...f, ...scheduleFrom(nextHour(), preset.days) }))}
              >
                {preset.label}
              </Button>
            ))}
          </Group>
        )}

        <Group grow align="flex-start">
          {dateField("Applications open", "applicationsOpenAt", "Members can start applying")}
          {dateField("Applications close", "applicationsCloseAt", "Candidate list is final")}
        </Group>
        <Group grow align="flex-start">
          {dateField("Voting opens", "votingOpensAt", "May overlap the application window")}
          {dateField("Voting closes", "votingClosesAt", "Results are ready to confirm")}
        </Group>
        {windowError && <Text size="xs" c="red">{windowError}</Text>}

        <Textarea
          label="Note for members"
          placeholder="Optional — shown on the elections page."
          autosize
          minRows={2}
          maxLength={1000}
          value={form.note}
          onChange={(e) => set("note", e.currentTarget.value)}
        />

        {!isEdit && (
          <Alert color="grape" variant="light">
            The election opens, closes voting, and computes results on its own. You confirm the winners at the end.
          </Alert>
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          {isEdit ? (
            <Button onClick={() => submit(false)} loading={pending} disabled={!canSubmit}>Save changes</Button>
          ) : (
            <>
              <Button variant="light" onClick={() => submit(false)} loading={create.isPending} disabled={!canSubmit}>Save draft</Button>
              <Button onClick={() => submit(true)} loading={create.isPending} disabled={!canSubmit}>Create & schedule</Button>
            </>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
