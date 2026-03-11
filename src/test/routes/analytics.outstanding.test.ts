import { Server } from 'http';

import request from 'supertest';

import { buildRouteTestServer, extractCsrfToken } from './routeTestUtils';

let server: Server;
let closeServer: () => Promise<void>;

const unmappedCriticalTaskRow = {
  case_id: 'C-456',
  task_id: 'T-456',
  task_name: 'Review evidence',
  case_type_label: 'Benefit',
  region: 'North',
  location: 'Leeds',
  created_date: '2024-01-10',
  due_date: '2024-01-12',
  priority: 'High',
  assignee: 'unmapped-user-id',
};

beforeAll(async () => {
  ({ server, close: closeServer } = await buildRouteTestServer({
    analyticsMocks: {
      outstandingCriticalTaskRows: [unmappedCriticalTaskRow],
      outstandingCriticalTaskCount: 1,
    },
  }));
});

afterAll(() => {
  return closeServer();
});

describe('Analytics outstanding route', () => {
  describe('on GET', () => {
    test('should render the outstanding page', async () => {
      const response = await request(server).get('/outstanding').expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Tasks outstanding');
      const workTypeIndex = response.text.indexOf('Work type');
      const taskNameIndex = response.text.indexOf('Task name');
      expect(workTypeIndex).toBeGreaterThan(-1);
      expect(taskNameIndex).toBeGreaterThan(-1);
      expect(workTypeIndex).toBeLessThan(taskNameIndex);
      expect(response.text).toContain('data-module="moj-sortable-table"');
      expect(response.text).toContain('analytics-table--wrap-critical-columns');
      expect(response.text).toMatch(
        /data-export-filename="outstanding-open-tasks\.csv"[\s\S]*?<th[^>]*aria-sort="ascending"[^>]*>\s*Created date\s*<\/th>/
      );
      expect(response.text).toMatch(
        /data-export-filename="outstanding-wait-time\.csv"[\s\S]*?<th[^>]*aria-sort="ascending"[^>]*>\s*Assigned date\s*<\/th>/
      );
      expect(response.text).toMatch(
        /data-export-filename="outstanding-tasks-due\.csv"[\s\S]*?<th[^>]*aria-sort="ascending"[^>]*>\s*Due date\s*<\/th>/
      );
      expect(response.text).toMatch(
        /data-export-filename="outstanding-open-tasks-priority\.csv"[\s\S]*?<th[^>]*aria-sort="ascending"[^>]*>\s*Due date\s*<\/th>/
      );
      expect(response.text).toMatch(
        /data-export-filename="outstanding-open-by-name\.csv"[\s\S]*?<th[^>]*aria-sort="descending"[^>]*>\s*Urgent\s*<\/th>/
      );
      expect(response.text).toMatch(
        /data-export-filename="outstanding-by-location-region\.csv"[\s\S]*?<th[^>]*aria-sort="ascending"[^>]*>\s*Region\s*<\/th>[\s\S]*?<th[^>]*aria-sort="none"[^>]*>\s*Location\s*<\/th>/
      );
      expect(response.text).toContain('name="resetFilters"');
      expect(response.text).not.toContain('href="/outstanding?resetFilters=1"');
    }, 15000);

    test('should render the open tasks summary partial for ajax requests', async () => {
      const response = await request(server)
        .get('/outstanding?ajaxSection=open-tasks-summary')
        .set('X-Requested-With', 'fetch')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Open tasks');
      expect(response.text).not.toContain('Tasks outstanding');
    }, 15000);

    test('should render Judge when critical task assignee is not mapped in staff ref data', async () => {
      const response = await request(server)
        .get('/outstanding?ajaxSection=criticalTasks')
        .set('X-Requested-With', 'fetch')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Critical tasks');
      expect(response.text).toContain('C-456');
      expect(response.text).toContain('Judge');
      expect(response.text).not.toContain('unmapped-user-id');
      expect(response.text).not.toContain('Tasks outstanding');
    }, 15000);

    test('should fall back to the full page when ajaxSection is unknown', async () => {
      const response = await request(server)
        .get('/outstanding?ajaxSection=unknown-section')
        .set('X-Requested-With', 'fetch')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Tasks outstanding');
    });
  });

  describe('on POST', () => {
    test('should reject requests without a CSRF token', async () => {
      const response = await request(server).post('/outstanding').type('form').send({ service: 'Tribunal' });

      expect(response.status).toBe(403);
    });

    test('should accept requests with a CSRF token', async () => {
      const agent = request.agent(server);
      const tokenResponse = await agent.get('/outstanding').expect(200);
      const token = extractCsrfToken(tokenResponse.text);

      const response = await agent
        .post('/outstanding')
        .type('form')
        .send({ _csrf: token, service: 'Tribunal' })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Tasks outstanding');
    });
  });
});
