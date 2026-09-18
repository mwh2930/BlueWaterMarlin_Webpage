import { app } from '@azure/functions';
import { createAzureService } from './azure.mjs';
import { createHandler, response } from './service.mjs';

let service;
const getService = async () => {
  if (!service) service = createAzureService().catch(() => { service = null; throw new Error('service-unavailable'); });
  return service;
};

// Only these two read-only routes exist. No public mutation or operator route.
for (const action of ['catalog', 'report']) {
  app.http('reports-' + action, {
    methods: ['GET'], authLevel: 'anonymous', route: 'reports/' + action,
    handler: async request => {
      try {
        const destination = request.query.getAll('destination');
        if (action === 'report' && (destination.length !== 1 || [...request.query.keys()].some(key => key !== 'destination'))) return response(404, { error: 'No current report is available for this destination.' });
        const data = await getService();
        return await createHandler(data)({ method: request.method, action, destination: destination[0] });
      } catch {
        // Do not echo SDK exceptions, request URLs, or configuration to clients.
        return response(503, { error: 'The report service is temporarily unavailable.' });
      }
    }
  });
}
