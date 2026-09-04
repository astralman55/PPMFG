import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Guards the whole /ops segment and its /api/ops backing routes - see
 * CLAUDE_CODE_BRIEF.md §10: "Supabase Auth, single admin, middleware guard
 * on the whole segment." Not just "signed in" - the signed-in email must
 * match OPS_ALLOWED_EMAIL exactly. There is deliberately no self-serve
 * signup; the one admin account is created by the owner directly in the
 * Supabase dashboard (see CLAUDE_CODE_BRIEF.md §16).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isOpsPage = pathname.startsWith("/ops");
  const isOpsApi = pathname.startsWith("/api/ops");
  if (!isOpsPage && !isOpsApi) return NextResponse.next();
  if (pathname === "/ops/login") return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const allowedEmail = process.env.OPS_ALLOWED_EMAIL;

  const denyResponse = () => {
    if (isOpsApi) return NextResponse.json({ error: "Not signed in to the operator console." }, { status: 401 });
    const loginUrl = new URL("/ops/login", request.url);
    return NextResponse.redirect(loginUrl);
  };

  if (!url || !anonKey || !allowedEmail) {
    // Fail closed: with no allowed email configured, nobody gets in rather
    // than everybody.
    return denyResponse();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== allowedEmail) {
    return denyResponse();
  }

  return response;
}

export const config = {
  matcher: ["/ops/:path*", "/api/ops/:path*"],
};
