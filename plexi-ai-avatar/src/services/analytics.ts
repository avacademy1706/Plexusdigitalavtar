/**
 * Free, local-only analytics abstraction.
 * Swap `sinks` for GA / PostHog / etc. later - call sites do not change.
 * NEVER pass keys, audio, transcripts or personal data as properties.
 */
export type AnalyticsEvent =
  | "avatar_loaded"
  | "conversation_started"
  | "microphone_permission_granted"
  | "user_message"
  | "plexi_response"
  | "conversation_ended"
  | "lead_form_opened"
  | "lead_submitted"
  | "cta_clicked";

export type AnalyticsProps = Record<string, string | number | boolean>;

export interface AnalyticsSink {
  track(event: AnalyticsEvent, properties: AnalyticsProps): void;
}

const consoleSink: AnalyticsSink = {
  track(event, properties) {
    if (import.meta.env.DEV) console.debug(`[analytics] ${event}`, properties);
  },
};

const sinks: AnalyticsSink[] = [consoleSink];

export const analytics = {
  track(event: AnalyticsEvent, properties: AnalyticsProps = {}): void {
    for (const sink of sinks) {
      try {
        sink.track(event, properties);
      } catch {
        /* analytics must never break the app */
      }
    }
  },
  /** Extension point: analytics.addSink(posthogSink) */
  addSink(sink: AnalyticsSink): void {
    sinks.push(sink);
  },
};
