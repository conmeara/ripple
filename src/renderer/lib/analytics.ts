import type {
  AnalyticsCaptureResult,
  RippleAnalyticsEventPayload,
} from "../../shared/ripple-analytics"

export async function captureAnalyticsEvent(
  payload: RippleAnalyticsEventPayload,
): Promise<AnalyticsCaptureResult> {
  return window.desktopApi.captureAnalyticsEvent(payload)
}

export function capture(payload: RippleAnalyticsEventPayload): void {
  void captureAnalyticsEvent(payload)
}

export function trackMessageSent(data: {
  mode: "plan" | "agent"
  entryPoint?: string
}) {
  capture({
    name: "ripple_chat_message_sent",
    properties: {
      entry_point: data.entryPoint ?? "chat_input",
      mode: data.mode,
    },
  })
}
