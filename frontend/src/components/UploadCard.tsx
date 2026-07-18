import { useState } from "react";
import { Button, Card, Group, Stack, Text, Textarea, ThemeIcon } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import { IconCloudUpload, IconFile3d, IconX } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadVersion } from "../api/client";
import { formatBytes } from "../utils/format";

const MAX_UPLOAD_MB = 250;
const ACCEPTED = [".rbxl", ".rbxlx"];

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED.some((ext) => lower.endsWith(ext));
}

export function UploadCard({ code, disabled }: { code: string; disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => uploadVersion(code, file!, note),
    onSuccess: async () => {
      notifications.show({
        color: "teal",
        title: "Upload received",
        message: "Your file was submitted and is now waiting for review.",
      });
      setFile(null);
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["store", code] });
      await queryClient.invalidateQueries({ queryKey: ["stores"] });
    },
    onError: () => {
      notifications.show({ color: "red", title: "Upload failed", message: "Could not upload the file. Please try again." });
    },
  });

  if (disabled) {
    return (
      <Card withBorder radius="lg" padding="lg">
        <Text fw={600}>Uploads are closed</Text>
        <Text size="sm" c="dimmed">This store is currently closed, so new files can't be submitted.</Text>
      </Card>
    );
  }

  return (
    <Card withBorder radius="lg" padding="lg">
      <Stack gap="md">
        <div>
          <Text fw={700} fz="lg">Upload a new store file</Text>
          <Text size="sm" c="dimmed">Submit a .rbxl (or .rbxlx) for the game owner to review and publish.</Text>
        </div>

        {!file ? (
          <Dropzone
            onDrop={(files) => {
              const dropped = files[0];
              if (dropped) setFile(dropped);
            }}
            onReject={() =>
              notifications.show({ color: "red", title: "File rejected", message: `Only ${ACCEPTED.join(", ")} up to ${MAX_UPLOAD_MB} MB.` })
            }
            maxSize={MAX_UPLOAD_MB * 1024 * 1024}
            multiple={false}
            validator={(f) => (hasAcceptedExtension(f.name) ? null : { code: "file-invalid-type", message: "Not a Roblox place file" })}
          >
            <Group justify="center" gap="xl" mih={140} style={{ pointerEvents: "none" }}>
              <Dropzone.Accept>
                <ThemeIcon size={54} radius="md" color="grape"><IconCloudUpload size={30} /></ThemeIcon>
              </Dropzone.Accept>
              <Dropzone.Reject>
                <ThemeIcon size={54} radius="md" color="red"><IconX size={30} /></ThemeIcon>
              </Dropzone.Reject>
              <Dropzone.Idle>
                <ThemeIcon size={54} radius="md" variant="default"><IconFile3d size={30} /></ThemeIcon>
              </Dropzone.Idle>
              <div>
                <Text size="lg" fw={600} inline>Drag your .rbxl here or click to browse</Text>
                <Text size="sm" c="dimmed" inline mt={6}>One file, up to {MAX_UPLOAD_MB} MB</Text>
              </div>
            </Group>
          </Dropzone>
        ) : (
          <Card withBorder radius="md" padding="sm" bg="var(--mantine-color-default-hover)">
            <Group justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon size={40} radius="md" variant="default"><IconFile3d size={22} /></ThemeIcon>
                <div style={{ minWidth: 0 }}>
                  <Text fw={600} truncate>{file.name}</Text>
                  <Text size="xs" c="dimmed">{formatBytes(file.size)}</Text>
                </div>
              </Group>
              <Button variant="subtle" color="gray" size="compact-sm" onClick={() => setFile(null)} disabled={mutation.isPending}>
                Remove
              </Button>
            </Group>
          </Card>
        )}

        <Textarea
          label="Note for the reviewer (optional)"
          placeholder="What changed in this version?"
          autosize
          minRows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />

        <Group justify="flex-end">
          <Button
            leftSection={<IconCloudUpload size={18} />}
            disabled={!file}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Submit for review
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
