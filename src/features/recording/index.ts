/** PR3's recording feature (§11). The screen imports from here, not from files. */
export { recordingFailure, type RecordingFailure, type RecordingFailureReason } from "./errors";
export { ensureRecordingPermissions } from "./permissions";
export { isPlayableMp4 } from "./mp4";
export { recoverOrphanedRecordings } from "./recovery";
export {
  audioPathFor,
  defaultRecordingTitle,
  deleteRecordingFiles,
  fileNameOf,
  listPersistedRecordings,
  persistRecording,
  updateRecordingMetadata,
} from "./storage";
export type {
  RecordingSession,
  RecordingSessionStatus,
} from "./use-recording-session";
export {
  RecordingSessionProvider,
  useRecordingSession,
} from "./session-context";
