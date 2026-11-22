import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Users } from "lucide-react";
import { toast } from "sonner";
import { adminsApi, type AdminPerson, type Person } from "./admins-api";
import { useAuth } from "../auth/auth-context";
import { errorMessage } from "../lib/api";
import { parseTime } from "../lib/time";
import { Avatar, Badge, EmptyState, Skeleton, Spinner } from "../components/ui/misc";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialog";
import { Input, Label } from "../components/ui/input";
import { PageHeader } from "./components/page-header";

/** "Mar 4, 2026" */
function longDate(value: string | null): string {
  const date = parseTime(value);
  return date ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
}

export default function AdminsPage() {
  const { user } = useAuth();
  const owner = !!user?.owner;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Admins" />

      {owner ? (
        <>
          <PeopleList />
          <PasswordCard />
        </>
      ) : (
        <AdminList />
      )}
    </div>
  );
}

function AdminList() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminPerson[] | null>(null);

  useEffect(() => {
    adminsApi
      .list()
      .then(({ admins }) => setAdmins(admins))
      .catch((err) => toast.error(errorMessage(err)));
  }, []);

  if (admins === null) return <Skeleton className="h-48 rounded-2xl" />;
  if (admins.length === 0) return <EmptyState icon={<Users />} title="No admins yet" />;

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {admins.map((admin) => (
        <li key={admin.id} className="flex items-center gap-3 px-4 py-3">
          <Avatar name={admin.name} src={admin.avatarUrl} size={36} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-sm font-medium">
              <span className="truncate">{admin.name}</span>
              {admin.owner ? <Badge tone="accent">Owner</Badge> : null}
              {admin.id === user?.id ? <Badge>You</Badge> : null}
            </p>
            <p className="truncate text-xs text-muted">
              {admin.email ?? "No email"}
              {admin.adminSince ? <span className="sm:hidden"> · Admin since {longDate(admin.adminSince)}</span> : null}
            </p>
          </div>
          {admin.adminSince ? (
            <p className="hidden shrink-0 text-xs text-muted sm:block">Admin since {longDate(admin.adminSince)}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Owner only: everyone with an account, admins first, with a button to change each one. */
function PeopleList() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);

  const load = useCallback(() => {
    adminsApi
      .people()
      .then(({ people }) => setPeople(people))
      .catch((err) => toast.error(errorMessage(err)));
  }, []);

  useEffect(load, [load]);

  async function setRole(person: Person, role: "admin" | "student") {
    setBusyId(person.id);
    try {
      await adminsApi.setRole(person.id, role);
      toast.success(role === "admin" ? `${person.name} is now an admin.` : `${person.name} is no longer an admin.`);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (people === null) return <Skeleton className="h-48 rounded-2xl" />;
  if (people.length === 0) return <EmptyState icon={<Users />} title="No accounts yet" />;

  const sorted = [...people.filter((p) => p.role === "admin"), ...people.filter((p) => p.role !== "admin")];

  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {sorted.map((person) => (
          <li key={person.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={person.name} src={person.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                <span className="truncate">{person.name}</span>
                {person.owner ? (
                  <Badge tone="accent">Owner</Badge>
                ) : person.role === "admin" ? (
                  <Badge tone="accent">Admin</Badge>
                ) : null}
                {person.id === user?.id ? <Badge>You</Badge> : null}
              </p>
              <p className="truncate text-xs text-muted">{person.email ?? "No email"}</p>
            </div>
            {person.owner ? null : person.role === "admin" ? (
              <Button variant="outline" size="sm" disabled={busyId === person.id} onClick={() => setRemoving(person)}>
                {busyId === person.id ? <Spinner /> : null}
                Remove admin
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={busyId === person.id} onClick={() => void setRole(person, "admin")}>
                {busyId === person.id ? <Spinner /> : null}
                Make admin
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? `Remove admin from ${removing.name}?` : "Remove admin?"}
        description="They become a student right away. They can become an admin again with the admin password."
        confirmLabel="Remove admin"
        danger
        onConfirm={() => {
          if (removing) void setRole(removing, "student");
        }}
      />
    </>
  );
}

/** Owner only: change the admin password. Hidden until opened; needs the current one. */
function PasswordCard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setCurrent("");
    setNext("");
    setAgain("");
    setShow(false);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (next !== again) {
      setError("The new passwords don't match.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminsApi.changePassword(current, next);
      toast.success("Admin password changed.");
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const type = show ? "text" : "password";

  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <KeyRound className="size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Admin password</h2>
          <p className="text-xs text-muted">What people type to become an admin.</p>
        </div>
        {open ? null : (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Change password
          </Button>
        )}
      </div>

      {open ? (
        <form onSubmit={save} className="mt-4 flex max-w-sm flex-col gap-3">
          <div>
            <Label htmlFor="admin-pw-current">Current password</Label>
            <Input
              id="admin-pw-current"
              type={type}
              autoComplete="current-password"
              autoFocus
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="admin-pw-next">New password</Label>
            <Input id="admin-pw-next" type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="admin-pw-again">New password again</Label>
            <Input id="admin-pw-again" type={type} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </div>
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="flex w-fit items-center gap-1.5 text-xs text-muted hover:text-fg"
          >
            {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {show ? "Hide passwords" : "Show passwords"}
          </button>
          {error ? <p className="text-sm text-bad">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={saving || !current || !next || !again}>
              {saving ? <Spinner /> : null}
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
