/**
 * PR1 fixtures. The shapes are the real domain types so screens written against
 * them survive the swap. Deliberately covers every §21 transcription state.
 *
 * PR4 moved the recording screens onto the index; what still reads from here is
 * transcript-shaped — the Transcripts list, transcript detail, and Home's
 * transcript count — because nothing produces a Transcript until PR7. Home's
 * count stays mocked on purpose, so it agrees with the Transcripts screen
 * rather than reading zero beside a list of four. PR7 removes all three.
 */
import type { Recording, Transcript, TranscriptionState } from "@/types";

export interface MockRecording extends Recording {
  transcripts: Transcript[];
  /** Derived in PR4; carried explicitly here so the mock can show every state. */
  transcriptionState: TranscriptionState;
}

const transcript = (
  id: string,
  recordingId: string,
  providerId: string,
  modelId: string,
  text: string,
  createdAt: string,
): Transcript => ({
  id,
  recordingId,
  providerId,
  modelId,
  text,
  createdAt,
  updatedAt: createdAt,
});

export const mockRecordings: MockRecording[] = [
  {
    id: "rec_01",
    title: "Meeting with Sam",
    source: "recorded",
    audioPath: "file:///mock/rec_01.m4a",
    mimeType: "audio/mp4",
    durationMs: 2_892_000,
    createdAt: "2026-10-04T14:32:00.000Z",
    updatedAt: "2026-10-04T14:32:00.000Z",
    transcriptionState: "transcribed",
    transcripts: [
      transcript(
        "tr_01",
        "rec_01",
        "groq",
        "whisper-large-v3",
        "So the main thing we agreed is that the original recording never gets touched. Everything downstream — the transcript, any summary, the metadata — can be regenerated from it. That's the whole point. If we lose the audio we've lost the only thing that was genuinely irreplaceable.",
        "2026-10-04T14:41:00.000Z",
      ),
      transcript(
        "tr_02",
        "rec_01",
        "deepgram",
        "nova-3",
        "So the main thing we agreed is that the original recording never gets touched. Everything downstream, the transcript, any summary, the metadata, can be regenerated from it. That's the whole point — if we lose the audio, we've lost the only thing that was genuinely irreplaceable.",
        "2026-10-04T14:46:00.000Z",
      ),
    ],
  },
  {
    id: "rec_02",
    title: "Voice note — groceries",
    source: "recorded",
    audioPath: "file:///mock/rec_02.m4a",
    mimeType: "audio/mp4",
    durationMs: 34_000,
    createdAt: "2026-10-04T08:12:00.000Z",
    updatedAt: "2026-10-04T08:12:00.000Z",
    transcriptionState: "not-transcribed",
    transcripts: [],
  },
  {
    id: "rec_03",
    title: "Lecture — distributed systems",
    source: "imported",
    audioPath: "file:///mock/rec_03.mp3",
    mimeType: "audio/mpeg",
    durationMs: 5_412_000,
    createdAt: "2026-10-03T09:05:00.000Z",
    updatedAt: "2026-10-03T09:05:00.000Z",
    transcriptionState: "transcribing",
    transcripts: [],
  },
  {
    id: "rec_04",
    title: "Interview — first draft",
    source: "imported",
    audioPath: "file:///mock/rec_04.wav",
    mimeType: "audio/wav",
    durationMs: 1_265_000,
    createdAt: "2026-09-28T16:40:00.000Z",
    updatedAt: "2026-09-28T16:40:00.000Z",
    transcriptionState: "failed",
    transcripts: [],
  },
];

export function findMockRecording(id: string): MockRecording | undefined {
  return mockRecordings.find((r) => r.id === id);
}
