declare namespace Express {
  // inject additional properties on express.Request
  interface Request {
    session: any;
  }
  interface User {
    username?: string;
  }
}
