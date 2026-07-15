import type { Request, Response, NextFunction } from 'express';
import type { IdToken } from 'ltijs';

export const requireTeacher = (_req: Request, res: Response, next: NextFunction) => {
  const token = res.locals.token as IdToken | undefined;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const roles = token.platformContext?.roles ?? [];
  const isTeacher = roles.some(
    (r) => r.includes('#Instructor') || r.includes('#Teacher')
  );

  if (!isTeacher) {
    return res.status(403).json({ error: 'Forbidden: Teacher role required' });
  }

  next();
};
