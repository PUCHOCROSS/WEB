// 로그아웃: <form method="post" action="/auth/logout">
import { NextResponse, type NextRequest } from "next/server";
import { MEMBER_COOKIE } from "../../../lib/memberSession";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin), 303);
  res.cookies.delete({ name: MEMBER_COOKIE, path: "/" });
  return res;
}
