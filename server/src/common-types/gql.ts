import { Request as ExpressRequest, Response } from 'express';
import { User } from 'src/models/User';

export interface GQLCtx {
  user?: User;
  res: Response;
  req: ExpressRequest;
}

export interface Request extends ExpressRequest {
  user?: User;
}
