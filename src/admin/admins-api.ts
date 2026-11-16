import { api } from "../lib/api";

// The admins list for every admin, plus the owner-only tools: everyone's
// account (to make or remove admins) and changing the admin password.

export interface AdminPerson {
  id: number;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  adminSince: string | null;
  owner: boolean;
}

export interface Person {
  id: number;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: "student" | "admin";
  owner: boolean;
}

export const adminsApi = {
  list: () => api<{ admins: AdminPerson[] }>("/api/admin/admins"),
  people: () => api<{ people: Person[] }>("/api/admin/admins/people"),
  setRole: (id: number, role: "admin" | "student") =>
    api<{ ok: true }>(`/api/admin/admins/people/${id}/role`, { method: "POST", body: JSON.stringify({ role }) }),
  changePassword: (current: string, next: string) =>
    api<{ ok: true }>("/api/admin/admins/password", { method: "POST", body: JSON.stringify({ current, next }) }),
};
