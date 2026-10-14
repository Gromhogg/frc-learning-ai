import { useEffect, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { adminsApi, type AdminPerson } from "./admins-api";
import { useAuth } from "../auth/auth-context";
import { errorMessage } from "../lib/api";
import { parseTime } from "../lib/time";
import { Avatar, Badge, EmptyState, Skeleton } from "../components/ui/misc";
import { PageHeader } from "./components/page-header";

/** "Mar 4, 2026" */
function longDate(value: string | null): string {
  const date = parseTime(value);
  return date ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
}

// Read-only list of everyone who is an admin, oldest first.
export default function AdminsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminPerson[] | null>(null);

  useEffect(() => {
    adminsApi
      .list()
      .then(({ admins }) => setAdmins(admins))
      .catch((err) => toast.error(errorMessage(err)));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Admins" description="Everyone who can change the AI's instructions, facts, docs, and settings." />

      <div className="mb-6 flex gap-3 rounded-2xl border border-line bg-surface-2/60 px-4 py-3 text-sm text-fg-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="space-y-1">
          <p>Anyone who enters the admin password becomes an admin. Admin access can't be removed in the app.</p>
          <p className="text-muted">
            The password is set as <code className="font-mono text-[12.5px] text-fg-2">ADMIN_CODE</code> in the
            server's .env file.
          </p>
        </div>
      </div>

      {admins === null ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : admins.length === 0 ? (
        <EmptyState icon={<Users />} title="No admins yet" />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {admins.map((admin) => (
            <li key={admin.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={admin.name} src={admin.avatarUrl} size={36} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  <span className="truncate">{admin.name}</span>
                  {admin.id === user?.id ? <Badge>You</Badge> : null}
                </p>
                <p className="truncate text-xs text-muted">
                  {admin.email ?? "No email"}
                  {/* On phones the date fits better under the name. */}
                  {admin.adminSince ? <span className="sm:hidden"> · Admin since {longDate(admin.adminSince)}</span> : null}
                </p>
              </div>
              {admin.adminSince ? (
                <p className="hidden shrink-0 text-xs text-muted sm:block">Admin since {longDate(admin.adminSince)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
