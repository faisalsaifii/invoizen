import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const supabase = await createClient();

  // You can also use getUser() which will be slower.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  return user ? (
    <LogoutButton />
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"} className="h-auto px-2 py-1">
        <Link href="/auth/login">Sign in</Link>
      </Button>
      <Button asChild size="sm" variant={"default"} className="h-auto px-2 py-1">
        <Link href="/auth/sign-up">Sign up</Link>
      </Button>
    </div>
  );
}
