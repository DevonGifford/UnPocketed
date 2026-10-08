import { OptionPicker } from "@/components/option-picker";
import type { ExportFormat } from "@/features/transcription";

/**
 * Choosing an export format (§24, §3.4).
 *
 * Each option says what the format is *for* rather than what it is. "JSON"
 * tells someone who already knows; "everything, for backups or moving to
 * another app" tells the person §3.4 is written for — one who wants their data
 * out and does not care what a format is called.
 */
export function ExportPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (format: ExportFormat) => void;
}) {
  return (
    <OptionPicker
      open={open}
      onOpenChange={onOpenChange}
      title="Export transcript"
      description="Exports leave this device only when you send them somewhere. Nothing is uploaded."
      options={[
        {
          id: "txt",
          label: "Plain text",
          detail: "The words alone, for pasting anywhere",
        },
        {
          id: "md",
          label: "Markdown",
          detail: "Readable, with the recording and model it came from",
        },
        {
          id: "json",
          label: "JSON",
          detail: "Everything, for backups or moving to another app",
        },
      ]}
      selectedId={null}
      onSelect={(id) => onSelect(id as ExportFormat)}
    />
  );
}
