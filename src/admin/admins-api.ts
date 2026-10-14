import { api } from "../lib/api";

// The admins list. Read-only: admin access can't be removed in the app.

export interface AdminPerson {
  id: number;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  adminSince: string | null;
}

export const adminsApi = {
  list: () => api<{ admins: AdminPerson[] }>("/api/admin/admins"),
};
