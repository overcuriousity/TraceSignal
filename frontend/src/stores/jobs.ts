/**
 * Job tray store — tracks active ingest/embed jobs across route changes.
 * Jobs are polled from /api/jobs/{id} until terminal.
 */
import { create } from "zustand";
import type { Job } from "@/api/types";

export interface TrackedJob extends Job {
  label: string;
  dismissed: boolean;
  /** "caseId/timelineId" for embed jobs — used to invalidate the timeline query on completion. */
  timelineKey?: string;
}

interface JobsState {
  jobs: Record<string, TrackedJob>;
  addJob: (id: string, label: string, timelineKey?: string) => void;
  updateJob: (job: Job) => void;
  dismiss: (id: string) => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: {},

  addJob: (id, label, timelineKey) =>
    set((s) => ({
      jobs: {
        ...s.jobs,
        [id]: {
          id,
          kind: "unknown",
          status: "queued",
          progress: null,
          result: null,
          error: null,
          label,
          dismissed: false,
          timelineKey,
        },
      },
    })),

  updateJob: (job) =>
    set((s) => {
      const existing = s.jobs[job.id];
      if (!existing) return s;
      return {
        jobs: {
          ...s.jobs,
          [job.id]: { ...existing, ...job },
        },
      };
    }),

  dismiss: (id) =>
    set((s) => {
      const existing = s.jobs[id];
      if (!existing) return s;
      return {
        jobs: { ...s.jobs, [id]: { ...existing, dismissed: true } },
      };
    }),
}));
