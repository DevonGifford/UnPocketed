/** PR7's transcription feature (§18–§22). Screens import from here. */
export { maskApiKey, readApiKey, writeApiKey } from "./credentials";
export {
  transcriptionFailure,
  type TranscriptionFailure,
  type TranscriptionFailureReason,
} from "./errors";
export {
  chooseDiarize,
  chooseModel,
  chooseProvider,
  diarizeEnabled,
  effectiveSelection,
  readPreferences,
  resetPreferencesCache,
  type TranscriptionPreferences,
  type TranscriptionSelection,
} from "./preferences";
export {
  currentProviderDescriptor,
  currentSelection,
  listTranscriptionTargets,
  resolveProvider,
  resolveSelectedProvider,
  type TranscriptionTarget,
} from "./provider";
export {
  exportTranscript,
  transcriptAsJson,
  transcriptAsMarkdown,
  transcriptAsText,
  type ExportedFile,
  type ExportFormat,
} from "./export";
export {
  shareRecordingAudio,
  shareTranscript,
  type ShareOutcome,
} from "./share";
export {
  editableTurnsFor,
  editedTranscript,
  isProviderOutput,
  turnsChanged,
  type EditableTurn,
} from "./editing";
export { readingViewFor, segmentsCoverText, type ReadingView } from "./reading";
export {
  allJobs,
  clearJob,
  deleteTranscript,
  deleteTranscriptsFor,
  findTranscript,
  jobFor,
  listAllTranscripts,
  reconcileTranscripts,
  saveTranscript,
  transcriptsFor,
} from "./repository";
export { useResumeTranscriptions } from "./resume-on-launch";
export { groupTranscriptsByRecording, transcriptionStateOf } from "./state";
export {
  hasOutstandingJob,
  resumeOutstandingJobs,
  transcribeRecording,
  type TranscribeOutcome,
} from "./transcribe";
export {
  useRecordingTranscription,
  useTranscript,
  useTranscripts,
  useTranscriptionSummaries,
  type RecordingTranscription,
  type TranscriptionSummary,
} from "./use-transcription";
