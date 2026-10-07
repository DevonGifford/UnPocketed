/** PR7's transcription feature (§18–§22). Screens import from here. */
export { maskApiKey, readApiKey, writeApiKey } from "./credentials";
export {
  transcriptionFailure,
  type TranscriptionFailure,
  type TranscriptionFailureReason,
} from "./errors";
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
  type RecordingTranscription,
} from "./use-transcription";
