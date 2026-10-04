/** Formatting helpers shared by the library, detail and record screens. */

/** `48:12`, or `1:04:33` once past an hour. Used for durations and elapsed time. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** `Today, 14:32` / `Yesterday, 09:05` / `4 Oct, 14:32` (§15). */
export function formatRecordedAt(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDelta = Math.round(
    (startOfDay(now) - startOfDay(date)) / 86_400_000,
  );

  if (dayDelta === 0) return `Today, ${time}`;
  if (dayDelta === 1) return `Yesterday, ${time}`;

  const day = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return `${day}, ${time}`;
}

/** `2 transcripts` / `1 transcript` / `Not transcribed` (§15). */
export function formatTranscriptCount(count: number): string {
  if (count === 0) return "Not transcribed";
  return count === 1 ? "1 transcript" : `${count} transcripts`;
}
