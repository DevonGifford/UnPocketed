/** PR 9.5's enrichment feature (§10, §38). Screens import from here. */
export {
  maskEnrichmentKey,
  readEnrichmentKey,
  writeEnrichmentKey,
} from "./credentials";
export {
  cleanupAvailable,
  cleanupTranscript,
  type CleanupOutcome,
} from "./cleanup";
export { enrichTranscript, enrichmentInputFor, type EnrichOutcome } from "./enrich";
export { resolveSelectedEnrichment } from "./provider";
export {
  enrichmentFailure,
  type EnrichmentFailure,
  type EnrichmentFailureReason,
} from "./errors";
export {
  chooseEnrichmentModel,
  chooseEnrichmentProvider,
  effectiveEnrichmentSelection,
  readEnrichmentPreferences,
  resetEnrichmentPreferencesCache,
  type EnrichmentPreferences,
  type EnrichmentSelection,
} from "./preferences";
export {
  briefsFor,
  deleteBrief,
  deleteBriefsFor,
  listAllBriefs,
  reconcileBriefs,
  saveBrief,
} from "./repository";
export { briefIdFor } from "./storage";
export {
  useTranscriptEnrichment,
  type TranscriptEnrichment,
} from "./use-enrichment";
