import { useOutletContext } from "react-router-dom";

export interface AdminCounts {
  drafts: number;
  facts: number;
}

export interface AdminOutletContext {
  counts: AdminCounts;
  /** Re-fetch the badge counts in the side menu after a change. */
  refreshCounts: () => void;
}

export function useAdmin() {
  return useOutletContext<AdminOutletContext>();
}
