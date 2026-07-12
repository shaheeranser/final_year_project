import type { Request, Response } from 'express';
import type { IdToken } from 'ltijs';

export const getSessionMe = (_req: Request, res: Response) => {
  const token = res.locals.token as IdToken | undefined;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const roles = token.platformContext?.roles ?? [];
  const isTeacher = roles.some(
    (r) => r.includes("#Instructor") || r.includes("#Teacher")
  );

  res.json({
    userId: token.user,
    name: token.userInfo?.name ?? "Unknown User",
    role: isTeacher ? "teacher" : "student",
  });
};
