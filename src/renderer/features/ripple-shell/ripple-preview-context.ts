import type { RippleTimelineRangeSelection } from "../../../shared/hyperframes-timeline-model"
import {
  RIPPLE_TIMELINE_FPS,
  timelineSecondsToFrame,
} from "../../../shared/hyperframes-timeline-model"
import {
  normalizeRipplePreviewTime,
  shouldIgnorePendingRipplePreviewTimeUpdate,
  shouldKeepStickyRipplePreviewTime,
} from "./ripple-preview-time"

export type RipplePreviewTarget =
  | { kind: "main" }
  | { kind: "comment-revision"; revisionId: string; seekTime: number }
  | { kind: "chat-worktree"; chatId: string }

export interface RipplePreviewSeekRequest {
  time: number
  requestId: number
}

export interface RipplePreviewContextState {
  projectId: string
  compositionId: string | null
  target: RipplePreviewTarget
  time: number
  frame: number
  fps: number
  seekRequest: RipplePreviewSeekRequest | null
  pendingSeekTime: number | null
  selectedCommentThreadId: string | null
  timelineSelection: RippleTimelineRangeSelection | null
}

export type RipplePreviewContextAction =
  | { type: "show-main"; time?: number | null; clearCommentSelection?: boolean }
  | { type: "open-project-chat" }
  | { type: "preview-chat-draft"; chatId: string }
  | { type: "preview-revision"; revisionId: string; time: number }
  | { type: "open-revision-chat"; revisionId?: string | null; time?: number | null }
  | { type: "select-comment-preview"; threadId: string; time: number; revisionId?: string | null }
  | { type: "set-selected-comment-thread"; threadId: string | null }
  | { type: "clear-comment-preview" }
  | { type: "set-timeline-selection"; selection: RippleTimelineRangeSelection | null }
  | { type: "composition-changed"; projectId: string; compositionId?: string | null }
  | { type: "preview-time-changed"; time: number; frame?: number; fps?: number }

export function createInitialRipplePreviewContext(input: {
  projectId: string
  compositionId?: string | null
}): RipplePreviewContextState {
  return {
    projectId: input.projectId,
    compositionId: input.compositionId ?? null,
    target: { kind: "main" },
    time: 0,
    frame: 0,
    fps: RIPPLE_TIMELINE_FPS,
    seekRequest: null,
    pendingSeekTime: null,
    selectedCommentThreadId: null,
    timelineSelection: null,
  }
}

export function getActiveRipplePreviewRevisionId(
  target: RipplePreviewTarget,
): string | null {
  return target.kind === "comment-revision" ? target.revisionId : null
}

export function getActiveRipplePreviewChatId(
  target: RipplePreviewTarget,
): string | null {
  return target.kind === "chat-worktree" ? target.chatId : null
}

function seekToTime(
  state: RipplePreviewContextState,
  time: number | null | undefined,
): Pick<RipplePreviewContextState, "time" | "frame" | "seekRequest" | "pendingSeekTime"> {
  const nextTime = normalizeRipplePreviewTime(time)
  return {
    time: nextTime,
    frame: timelineSecondsToFrame(nextTime, state.fps),
    seekRequest: {
      time: nextTime,
      requestId: (state.seekRequest?.requestId ?? 0) + 1,
    },
    pendingSeekTime: nextTime,
  }
}

function seekCurrentTime(
  state: RipplePreviewContextState,
): Pick<RipplePreviewContextState, "time" | "frame" | "seekRequest" | "pendingSeekTime"> {
  return seekToTime(state, state.time)
}

function targetForRevision(
  revisionId: string | null | undefined,
  time: number,
): RipplePreviewTarget {
  return revisionId
    ? { kind: "comment-revision", revisionId, seekTime: time }
    : { kind: "main" }
}

export function ripplePreviewContextReducer(
  state: RipplePreviewContextState,
  action: RipplePreviewContextAction,
): RipplePreviewContextState {
  switch (action.type) {
    case "show-main": {
      const seek = seekToTime(state, action.time ?? state.time)
      return {
        ...state,
        ...seek,
        target: { kind: "main" },
        selectedCommentThreadId: action.clearCommentSelection
          ? null
          : state.selectedCommentThreadId,
      }
    }

    case "open-project-chat": {
      return {
        ...state,
        ...seekCurrentTime(state),
        target: { kind: "main" },
        selectedCommentThreadId: null,
      }
    }

    case "preview-chat-draft": {
      return {
        ...state,
        ...seekCurrentTime(state),
        target: { kind: "chat-worktree", chatId: action.chatId },
      }
    }

    case "preview-revision": {
      const seek = seekToTime(state, action.time)
      return {
        ...state,
        ...seek,
        target: { kind: "comment-revision", revisionId: action.revisionId, seekTime: seek.time },
      }
    }

    case "open-revision-chat": {
      const seek = seekToTime(state, action.time ?? state.time)
      return {
        ...state,
        ...seek,
        target: targetForRevision(action.revisionId, seek.time),
      }
    }

    case "select-comment-preview": {
      const seek = seekToTime(state, action.time)
      return {
        ...state,
        ...seek,
        target: targetForRevision(action.revisionId, seek.time),
        selectedCommentThreadId: action.threadId,
      }
    }

    case "set-selected-comment-thread":
      return {
        ...state,
        selectedCommentThreadId: action.threadId,
      }

    case "clear-comment-preview": {
      return {
        ...state,
        ...seekCurrentTime(state),
        target: { kind: "main" },
        selectedCommentThreadId: null,
      }
    }

    case "set-timeline-selection":
      return {
        ...state,
        timelineSelection: action.selection,
      }

    case "composition-changed": {
      const nextCompositionId = action.compositionId ?? null
      if (
        action.projectId === state.projectId &&
        nextCompositionId === state.compositionId
      ) {
        return state
      }

      if (action.projectId !== state.projectId) {
        return createInitialRipplePreviewContext({
          projectId: action.projectId,
          compositionId: nextCompositionId,
        })
      }

      const preservedTime = normalizeRipplePreviewTime(state.time)
      return {
        ...state,
        projectId: action.projectId,
        compositionId: nextCompositionId,
        target: { kind: "main" },
        time: preservedTime,
        frame: timelineSecondsToFrame(preservedTime, state.fps),
        seekRequest: {
          time: preservedTime,
          requestId: (state.seekRequest?.requestId ?? 0) + 1,
        },
        pendingSeekTime: preservedTime,
        selectedCommentThreadId: null,
        timelineSelection:
          state.timelineSelection?.compositionId === nextCompositionId
            ? state.timelineSelection
            : null,
      }
    }

    case "preview-time-changed": {
      const nextTime = normalizeRipplePreviewTime(action.time)
      const nextFps =
        typeof action.fps === "number" && Number.isFinite(action.fps) && action.fps > 0
          ? Math.round(action.fps)
          : state.fps
      const nextFrame =
        typeof action.frame === "number" && Number.isFinite(action.frame)
          ? Math.max(0, Math.round(action.frame))
          : timelineSecondsToFrame(nextTime, nextFps)

      if (
        shouldIgnorePendingRipplePreviewTimeUpdate({
          pendingSeekTime: state.pendingSeekTime,
          incomingTime: nextTime,
        })
      ) {
        return state
      }

      if (
        state.pendingSeekTime !== null &&
        shouldKeepStickyRipplePreviewTime({
          currentTime: state.pendingSeekTime,
          incomingTime: nextTime,
        })
      ) {
        return {
          ...state,
          fps: nextFps,
          frame: nextFrame,
          pendingSeekTime: null,
        }
      }

      if (
        shouldKeepStickyRipplePreviewTime({
          currentTime: state.time,
          incomingTime: nextTime,
        })
      ) {
        return {
          ...state,
          fps: nextFps,
          frame: nextFrame,
          pendingSeekTime: null,
        }
      }

      return {
        ...state,
        fps: nextFps,
        frame: nextFrame,
        time: nextTime,
        pendingSeekTime: null,
      }
    }
  }
}

export function resolveRipplePreviewContextForProjectSelection(
  state: RipplePreviewContextState,
  input: {
    projectId: string
    compositionId?: string | null
  },
): RipplePreviewContextState {
  const nextCompositionId = input.compositionId ?? null
  if (
    state.projectId === input.projectId &&
    state.compositionId === nextCompositionId
  ) {
    return state
  }

  return ripplePreviewContextReducer(state, {
    type: "composition-changed",
    projectId: input.projectId,
    compositionId: nextCompositionId,
  })
}
