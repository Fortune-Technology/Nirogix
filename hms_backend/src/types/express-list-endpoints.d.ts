declare module 'express-list-endpoints' {
  import type { Express, Router } from 'express';

  interface Endpoint {
    path: string;
    methods: string[];
    middlewares: string[];
  }

  function listEndpoints(app: Express | Router): Endpoint[];
  export default listEndpoints;
}
