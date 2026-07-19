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
  cancelMyApplication,
  resolveApplication,
  voteForApplication,
  undoElectionVote,
  clearDebugRole,
  setDebugRole,
  type DebugRole,
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

export function useCancelMyApplication() {
  const invalidate = useInvalidateElections();
  return useMutation({
    mutationFn: cancelMyApplication,
    onSuccess: async () => {
      notifications.show({ color: "orange", title: "Application cancelled", message: "You can still vote. A Game owner can delete the record if you need to apply again." });
      await invalidate();
    },
    onError: () => notifications.show({ color: "red", title: "Could not cancel", message: "Only an active application can be cancelled." }),
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
