import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/stacks");

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-2xl font-semibold">pilestack</h1>
      <p className="mt-3 text-muted">
        A shared review surface for stacked pull requests — sign in with GitHub to see the
        stacks Pilestack has picked up from your installed repositories.
      </p>
      <form
        className="mt-8"
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/stacks" });
        }}
      >
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 font-medium text-accent-foreground"
        >
          Sign in with GitHub
        </button>
      </form>
    </div>
  );
}
