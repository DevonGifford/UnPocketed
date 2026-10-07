/** PR3's recording feature (§11). The screen imports from here, not from files. */
export { recordingFailure, type RecordingFailure, type RecordingFailureReason } from "./errors";
export { ensureRecordingPermissions } from "./permissions";
export {
  audioPathFor,
  defaultRecordingTitle,
  deleteRecordingFiles,
  fileNameOf,
  listPersistedRecordings,
  persistRecording,
  updateRecordingMetadata,
} from "./storage";
export {
  useRecordingSession,
  type RecordingSession,
  type RecordingSessionStatus,
} from "./use-recording-session";
