import { Server } from 'http';

import request from 'supertest';

import { buildRouteTestServer, extractCsrfToken } from './routeTestUtils';

let server: Server;
let closeServer: () => Promise<void>;

beforeAll(async () => {
  ({ server, close: closeServer } = await buildRouteTestServer());
});

afterAll(() => {
  return closeServer();
});

describe('Analytics completed routes', () => {
  describe('on GET', () => {
    test('should render the completed page', async () => {
      const response = await request(server).get('/completed').expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Completed tasks');
      const workTypeIndex = response.text.indexOf('Work type');
      const taskNameIndex = response.text.indexOf('Task name');
      expect(workTypeIndex).toBeGreaterThan(-1);
      expect(taskNameIndex).toBeGreaterThan(-1);
      expect(workTypeIndex).toBeLessThan(taskNameIndex);
      const processingHandlingTimeIndex = response.text.indexOf('Processing and handling time');
      const taskAuditIndex = response.text.indexOf('Task audit');
      const regionLocationIndex = response.text.indexOf('Tasks completed by region or location');
      expect(processingHandlingTimeIndex).toBeGreaterThan(-1);
      expect(taskAuditIndex).toBeGreaterThan(-1);
      expect(regionLocationIndex).toBeGreaterThan(-1);
      expect(processingHandlingTimeIndex).toBeLessThan(taskAuditIndex);
      expect(taskAuditIndex).toBeLessThan(regionLocationIndex);
      expect(response.text).toMatch(
        /id="processingHandlingTimeChart"[\s\S]*Overall average of (handling|processing) time \(days\)[\s\S]*id="processingHandlingTimeTable"/
      );
      expect(response.text).toContain('data-module="moj-sortable-table"');
      expect(response.text).toMatch(
        /data-export-filename="completed-by-name\.csv"[\s\S]*?<th[^>]*aria-sort="descending"[^>]*>\s*Tasks\s*<\/th>/
      );
      expect(response.text).toMatch(
        /data-export-filename="completed-task-audit\.csv"[\s\S]*?<th[^>]*aria-sort="descending"[^>]*>\s*Completed date\s*<\/th>/
      );
      expect(response.text).toContain('Outcome');
    });

    test('should render the completed summary partial for ajax requests', async () => {
      const response = await request(server)
        .get('/completed?ajaxSection=completed-summary')
        .set('X-Requested-With', 'fetch')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Completed tasks (today)');
      expect(response.text).not.toContain('Processing and handling time');
    });

    test('should fall back to the full page when ajaxSection is unknown', async () => {
      const response = await request(server)
        .get('/completed?ajaxSection=unknown-section')
        .set('X-Requested-With', 'fetch')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Completed tasks');
    });
  });

  describe('on POST', () => {
    test('should reject requests without a CSRF token', async () => {
      const response = await request(server).post('/completed').type('form').send({ metric: 'processingTime' });

      expect(response.status).toBe(403);
    });

    test('should accept requests with a CSRF token', async () => {
      const agent = request.agent(server);
      const tokenResponse = await agent.get('/completed').expect(200);
      const token = extractCsrfToken(tokenResponse.text);

      const response = await agent
        .post('/completed')
        .type('form')
        .send({ _csrf: token, metric: 'processingTime' })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Completed tasks');
    });
  });
});
