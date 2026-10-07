/** PR4's library feature (§15). Screens import from here, not from files. */
export { planReconcile, type ReconcilePlan } from "./reconcile";
export {
  findRecording,
  indexRecording,
  listLibrary,
  reconcileLibrary,
} from "./repository";
export { useLibrary, useRecording } from "./use-library";
