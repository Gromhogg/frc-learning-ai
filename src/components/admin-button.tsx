import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AuthUser } from "../auth/auth-context";
import { api, errorMessage } from "../lib/api";
import { buttonClass } from "./ui/button-class";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";

// The top-right Admin button in the chat header. Admins go straight to the
// admin pages. Everyone else gets asked for the admin password first.
export function AdminButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  if (user.role === "admin") {
    return (
      <Link to="/admin" className={buttonClass("outline", "sm")}>
        <Settings2 />
        Admin
      </Link>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings2 />
        Admin
      </Button>
      <AdminPasswordDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function AdminPasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ token: string; user: AuthUser }>("/auth/admin-code", {
        method: "POST",
        body: JSON.stringify({ code: password }),
      });
      setSession(result.token, result.user);
      onOpenChange(false);
      setPassword("");
      toast.success("You're an admin now.");
      navigate("/admin");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setPassword("");
          setError(null);
        }
      }}
      title="Enter the admin password"
      description="Ask a mentor for the admin password. You only need to type it once."
      size="sm"
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input
          autoFocus
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          aria-label="Admin password"
        />
        {error ? <p className="text-sm text-bad">{error}</p> : null}
        <Button type="submit" variant="primary" disabled={busy || !password.trim()}>
          {busy ? "Checking…" : "Continue"}
        </Button>
      </form>
    </Dialog>
  );
}
