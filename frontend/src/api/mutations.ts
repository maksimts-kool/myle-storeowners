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
