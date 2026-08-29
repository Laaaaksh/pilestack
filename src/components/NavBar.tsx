import Link from "next/link";
import { auth, signIn, signOut } from "@/lib/auth";

export async function NavBar() {
  const session = await auth();

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="text-accent">▤</span>
          pilestack
        </Link>
        {session?.user ? (
          <div className="flex items-center gap-3 text-sm">
            <Link href="/stacks" className="text-muted hover:text-foreground">
              Stacks
            </Link>
            <span className="text-muted">{session.githubLogin ?? session.user.name}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className="text-muted hover:text-foreground underline">
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/stacks" });
            }}
          >
            <button
              type="submit"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
            >
              Sign in with GitHub
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
