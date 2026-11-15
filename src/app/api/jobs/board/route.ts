import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { findBoard } from "@/lib/jobs/sources";

const body = z.object({ input: z.string().trim().min(2).max(500) });

/** CAR-5: finds a company's job board (Greenhouse, Lever or Ashby) from its name or careers link. */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Type a company name or paste its careers link." }, { status: 400 });
  const company = await findBoard(parsed.data.input).catch(() => null);
  if (!company)
    return Response.json(
      {
        error: "Couldn't find a Greenhouse, Lever or Ashby job board for that. Try the link of one of their job posts.",
      },
      { status: 404 },
    );
  return Response.json({ company });
}
