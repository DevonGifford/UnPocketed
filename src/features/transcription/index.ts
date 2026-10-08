/** PR7's transcription feature (§18–§22). Screens import from here. */
export { maskApiKey, readApiKey, writeApiKey } from "./credentials";
export {
  transcriptionFailure,
  type TranscriptionFailure,
  type TranscriptionFailureReason,
} from "./errors";
export {
  chooseModel,
  chooseProvider,
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
  allJobs,
  clearJob,
  deleteTranscript,
  deleteTranscriptsFor,
  findTranscript,
  jobFor,
  listAllTranscripts,
  reconcileTranscripts,
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
