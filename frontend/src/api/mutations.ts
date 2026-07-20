import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  createStore,
  deleteStore,
  deleteTemplate,
  deleteVersion,
  reviewVersion,
  updateNotificationPrefs,
  updateStore,
  uploadTemplate,
  applyForElection,
  withdrawMyApplication,
  resolveApplication,
  voteForApplication,
  undoElectionVote,
  cancelElection,
  closeElection,
  createElection,
  deleteElection,
  publishElection,
  setElectionWinner,
  updateElection,
  clearDebugRole,
  setDebugRole,
  type DebugRole,
  type ElectionInput,
  type NotificationPrefs,
  type StoreInput,
} from "./client";

function useInvalidateStores() {
  const qc = useQueryClient();
  return async (code?: string) => {
    await qc.invalidateQueries({ queryKey: ["stores"] });
    await qc.invalidateQueries({ queryKey: ["pending"] });
    if (code) await qc.invalidateQueries({ queryKey: ["store", code] });
  };
}

function useInvalidateElections() {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries({ queryKey: ["elections"] });
    await qc.invalidateQueries({ queryKey: ["adminElections"] });
    await qc.invalidateQueries({ queryKey: ["availableElectionStores"] });
    await qc.invalidateQueries({ queryKey: ["adminApplications"] });
    await qc.invalidateQueries({ queryKey: ["stores"] });
    await qc.invalidateQueries({ queryKey: ["me"] });
  };
}

export function useApplyForElection() {
  const invalidate = useInvalidateElections();
  return useMutation({
    mutationFn: applyForElection,
    onSuccess: async (_data, code) => {
      notifications.show({ color: "teal", title: "Application received", message: `Your application for ${code} was saved and confirmed by DM.` });
      await invalidate();
    },
    onError: () => notifications.show({ color: "red", title: "Could not apply", message: "Your application may already have been used." }),
  });
}

export function useWithdrawMyApplication() {
  const invalidate = useInvalidateElections();
  return useMutation({
    mutationFn: withdrawMyApplication,
    onSuccess: async () => {
      notifications.show({ color: "orange", title: "Application withdrawn", message: "You can apply for another store while applications are open." });
      await invalidate();
    },
    onError: () => notifications.show({ color: "red", title: "Could not withdraw", message: "Applications for this election may already have closed." }),
  });
}

export function useCreateElection() {
  const invalidate = useInvalidateElections();
  return useMutation({
    mutationFn: (input: ElectionInput) => createElection(input),
    onSuccess: async (election) => {
      const message = election.status === "DRAFT"
        ? "Saved as a draft. Publish it when you are ready."
        : "Scheduled. It opens and closes on its own.";
      notifications.show({ color: "teal", title: `Election “${election.title}” created`, message });
      await invalidate();
    },
    onError: () => notifications.show({ color: "red", title: "Could not create election", message: "Check the dates and that each store is free." }),
  });
}

export function useUpdateElection() {
  const invalidate = useInvalidateElections();
  return useMutation({
    mutationFn: (v: { id: string; input: Partial<ElectionInput> }) => updateElection(v.id, v.input),
    onSuccess: async () => {
      notifications.show({ color: "teal", title: "Election updated", message: "The new schedule is live." });
      await invalidate();
    },
    onError: () => notifications.show({ color: "red", title: "Could not save", message: "Check the dates and that each store is free." }),
  });
}

const ELECTION_ACTION = {
  publish: { title: "Election published", message: "Members can see it; it opens at the scheduled time." },
  close: { title: "Election closed", message: "Stores without a winner went back to their previous status." },
  cancel: { title: "Election cancelled", message: "Votes were voided and every store was restored." },
  delete: { title: "Draft deleted", message: "The draft election was removed." },
} as const;

export function useElectionAction() {
  const invalidate = useInvalidateElections();
  return useMutation({
    mutationFn: (v: { id: string; action: keyof typeof ELECTION_ACTION }) =>
      v.action === "publish" ? publishElection(v.id)
        : v.action === "close" ? closeElection(v.id)
          : v.action === "cancel" ? cancelElection(v.id)
            : deleteElection(v.id),
    onSuccess: async (_data, v) => {
      notifications.show({ color: v.action === "cancel" ? "orange" : "teal", ...ELECTION_ACTION[v.action] });
      await invalidate();
    },
    onError: () => notifications.show({ color: "red", title: "Could not update election", message: "Refresh and try again." }),
  });
}

export function useSetElectionWinner() {
  const invalidate = useInvalidateElections();
  return useMutation({
    mutationFn: (v: { id: string; storeCode: string; applicationId: string }) =>
      setElectionWinner(v.id, v.storeCode, v.applicationId),
    onSuccess: async (_data, v) => {
      notifications.show({ color: "teal", title: `${v.storeCode} assigned`, message: "The winner owns the store and every other candidate was notified." });
      await invalidate();
    },
    onError: () => notifications.show({ color: "red", title: "Could not assign the store", message: "Refresh and try again." }),
  });
}

export function useVoteForApplication() {
  const invalidate = useInvalidateElections();
  return useMutation({
    mutationFn: voteForApplication,
    onSuccess: async () => {
      notifications.show({ color: "teal", title: "Vote recorded", message: "Your one vote for this store has been saved." });
      await invalidate();
    },
    onError: () => notifications.show({ color: "red", title: "Could not vote", message: "You can vote once per store, except the store you applied to." }),
  });
}

export function useUndoElectionVote() {
  const invalidate = useInvalidateElections();
  return useMutation({
    mutationFn: undoElectionVote,
    onSuccess: async () => {
      notifications.show({ color: "orange", title: "Vote removed", message: "You can now vote for another candidate in this store election." });
      await invalidate();
    },
    onError: () => notifications.show({ color: "red", title: "Could not undo vote", message: "Refresh the page and try again." }),
  });
}

export function useResolveApplication() {
  const invalidate = useInvalidateElections();
  return useMutation({
    mutationFn: (input: { id: string; action: "select" | "not-selected" | "remove" }) => resolveApplication(input.id, input.action),
    onSuccess: async (_data, input) => {
      const message = input.action === "select"
        ? "The owner was assigned and all other active candidates were notified."
        : input.action === "remove"
          ? "The application and its votes were deleted. The applicant was notified."
          : "The applicant was marked not selected and notified.";
      notifications.show({ color: "teal", title: "Election updated", message });
      await invalidate();
    },
    onError: () => notifications.show({ color: "red", title: "Could not update application", message: "Refresh and try again." }),
  });
}

export function useSetDebugRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { role: DebugRole; storeCode?: string }) => setDebugRole(input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["stores"] });
      notifications.show({ color: "orange", title: "Debug role applied", message: "This browser session is now using the selected role preview." });
    },
    onError: () => notifications.show({ color: "red", title: "Could not switch debug role", message: "Choose a valid store for the Store owner preview." }),
  });
}

export function useClearDebugRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearDebugRole,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["stores"] });
      notifications.show({ color: "teal", title: "Debug mode cleared", message: "Your normal Game owner permissions are restored." });
    },
    onError: () => notifications.show({ color: "red", title: "Could not clear debug mode", message: "Please try again." }),
  });
}

const ACTION_LABEL = { approve: "approved", decline: "declined", publish: "published" } as const;

export function useReview() {
  const invalidate = useInvalidateStores();
  return useMutation({
    mutationFn: (v: { code: string; id: string; action: "approve" | "decline" | "publish"; reviewNote?: string }) =>
      reviewVersion(v.code, v.id, v.action, v.reviewNote),
    onSuccess: async (_data, v) => {
      notifications.show({ color: "teal", title: "Done", message: `Submission ${ACTION_LABEL[v.action]}. The owner has been notified.` });
      await invalidate(v.code);
    },
    onError: () => notifications.show({ color: "red", title: "Action failed", message: "Please try again." }),
  });
}

export function useCreateStore() {
  const invalidate = useInvalidateStores();
  return useMutation({
    mutationFn: (input: StoreInput) => createStore(input),
    onSuccess: async (store) => {
      notifications.show({ color: "teal", title: "Store created", message: `${store.code} was created.` });
      await invalidate(store.code);
    },
    onError: () => notifications.show({ color: "red", title: "Could not create store", message: "Check the code isn't already used." }),
  });
}

export function useUpdateStore() {
  const invalidate = useInvalidateStores();
  return useMutation({
    mutationFn: (v: { code: string; input: StoreInput }) => updateStore(v.code, v.input),
    onSuccess: async (store) => {
      notifications.show({ color: "teal", title: "Saved", message: `${store.code} was updated.` });
      await invalidate(store.code);
    },
    onError: () => notifications.show({ color: "red", title: "Could not save", message: "Please try again." }),
  });
}

export function useDeleteStore() {
  const invalidate = useInvalidateStores();
  return useMutation({
    mutationFn: (code: string) => deleteStore(code),
    onSuccess: async (_d, code) => {
      notifications.show({ color: "orange", title: "Store deleted", message: `${code} and its files were removed.` });
      await invalidate();
    },
    onError: () => notifications.show({ color: "red", title: "Could not delete", message: "Please try again." }),
  });
}

export function useDeleteVersion(code: string) {
  const invalidate = useInvalidateStores();
  return useMutation({
    mutationFn: (id: string) => deleteVersion(code, id),
    onSuccess: async () => {
      notifications.show({ color: "orange", title: "File removed", message: "The uploaded version was permanently removed." });
      await invalidate(code);
    },
    onError: () => notifications.show({ color: "red", title: "Could not remove file", message: "The live file must be replaced before it can be removed." }),
  });
}

export function useUploadTemplate() {
  const invalidate = useInvalidateStores();
  return useMutation({
    mutationFn: (v: { code: string | null; file: File }) => uploadTemplate(v.code, v.file),
    onSuccess: async (_d, v) => {
      notifications.show({ color: "teal", title: "Template uploaded", message: v.code ? `Template set for ${v.code}.` : "Global template uploaded." });
      await invalidate(v.code ?? undefined);
    },
    onError: () => notifications.show({ color: "red", title: "Upload failed", message: "Please try again." }),
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<NotificationPrefs>) => updateNotificationPrefs(input),
    onSuccess: (prefs) => {
      qc.setQueryData(["notificationPrefs"], prefs);
      notifications.show({ color: "teal", title: "Saved", message: "Notification settings updated." });
    },
    onError: () => notifications.show({ color: "red", title: "Could not save", message: "Please try again." }),
  });
}

export function useDeleteTemplate(code: string) {
  const invalidate = useInvalidateStores();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: async () => {
      notifications.show({ color: "orange", title: "Template removed", message: "The template was deleted." });
      await invalidate(code);
    },
    onError: () => notifications.show({ color: "red", title: "Could not remove", message: "Please try again." }),
  });
}
