export {
  getVisualCaptureBackend,
  listImplementedVisualCaptureBackends,
} from "./backend-registry"
export {
  createVisualContextEndpoint,
  type VisualContextEndpointHandle,
  type VisualContextEndpointOptions,
} from "./endpoint"
export {
  createVisualContextFileBridge,
  VISUAL_CONTEXT_FILE_BRIDGE_VERSION,
  type VisualContextFileBridgeHandle,
  type VisualContextFileBridgeOptions,
} from "./file-bridge"
export { VisualContextError } from "./errors"
export {
  captureFramesWithFastBrowser,
  withBundledWsFallbacks,
  type VisualFastBrowserCaptureInput,
  type VisualFastBrowserCaptureResult,
} from "./fast-browser-capture"
export {
  VisualContextLifecycle,
  type VisualContextDispose,
} from "./lifecycle"
export {
  buildFrameSheetManifest,
  type FrameSheetManifest,
  type FrameSheetSample,
} from "./manifest"
export {
  VisualContextMetrics,
  visualContextMetrics,
  type VisualContextMetricEvent,
} from "./metrics"
export {
  createVisualContextService,
  RippleVisualContextService,
  type VisualContextServiceOptions,
} from "./service"
export { VisualContextRequestQueue } from "./session-pool"
export {
  DEFAULT_FRAME_SHEET_FPS,
  DEFAULT_FRAME_SHEET_SAMPLES,
  MAX_FRAME_SHEET_SAMPLES,
  buildFrameSheetSummary,
  frameForTime,
  getFrameSheetColumns,
  resolveFrameSheetTimestamps,
  secondsLabel,
  type VisualFrameSheetSamplingInput,
  type VisualFrameSheetSamplingResult,
} from "./sampling"
export {
  assembleFrameSheetWithFfmpeg,
  buildFrameSheetFfmpegArgs,
  type VisualFrameSheetAssemblyInput,
  type VisualFrameSheetExecFile,
} from "./sheet-assembly"
export {
  attachVisualContextSourceInvalidation,
  type VisualContextSourceInvalidationHandle,
  type VisualContextSourceWatcherRegistry,
} from "./source-invalidation"
export {
  resolveVisualCompositionTarget,
  normalizeVisualCompositionPath,
  VisualCompositionTargetError,
  type VisualCompositionTarget,
  type VisualCompositionTargetInput,
  type VisualRendererCompositionIdentity,
} from "./composition-targeting"
export {
  buildVisualProjectEntryUrl,
  closeVisualProjectServer,
  resolveVisualProjectFile,
  serveVisualProject,
  type VisualProjectFileResolution,
  type VisualProjectServerHandle,
} from "./project-server"
export type {
  VisualCapturedFrame,
  VisualCaptureBackend,
  VisualCaptureFramesRequest,
  VisualCaptureFramesResult,
  VisualCurrentFrameSnapshot,
  VisualCaptureReason,
  VisualContextIntentKind,
  VisualContextService,
  VisualContextBackendId,
  VisualSnapshotInput,
} from "./types"
