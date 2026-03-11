import { Server } from 'http';

import request from 'supertest';

import { buildRouteTestServer, extractCsrfToken } from './routeTestUtils';

let server: Server;
let closeServer: () => Promise<void>;

const assignedHighPriorityRow = {
  case_id: 'C-123',
  task_id: 'T-123',
  task_name: 'Task Alpha',
  jurisdiction_label: 'Service',
  role_category_label: 'Legal Ops',
  region: 'North',
  location: 'Leeds',
  created_date: '2024-01-01',
  first_assigned_date: '2024-01-02',
  due_date: '2024-01-03',
  completed_date: null,
  handling_time_days: null,
  is_within_sla: null,
  priority: 'High',
  assignee: 'user-1',
  number_of_reassignments: 0,
};

beforeAll(async () => {
  ({ server, close: closeServer } = await buildRouteTestServer({
    analyticsMocks: {
      userOverviewAssignedTaskRows: [assignedHighPriorityRow],
      userOverviewAssignedTaskCount: 1,
    },
  }));
});

afterAll(() => {
  return closeServer();
});

describe('Analytics user overview route', () => {
  describe('on GET', () => {
    test('should render the user overview page', async () => {
      const response = await request(server).get('/users').expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('User overview');
      const workTypeIndex = response.text.indexOf('Work type');
      const taskNameIndex = response.text.indexOf('Task name');
      expect(workTypeIndex).toBeGreaterThan(-1);
      expect(taskNameIndex).toBeGreaterThan(-1);
      expect(workTypeIndex).toBeLessThan(taskNameIndex);
      expect(response.text).toContain('data-module="moj-sortable-table"');
      expect(response.text).toContain('analytics-table--wrap-assigned-columns');
      expect(response.text).toContain('Created date');
      expect(response.text).toContain('Assigned date');
      expect(response.text).toContain('Total assignments');
      expect(response.text).toContain('High');
      expect(response.text).not.toMatch(/>\s*high\s*</);
      expect(response.text).toMatch(
        /data-export-filename="user-overview-completed-by-task-name\.csv"[\s\S]*?<th[^>]*aria-sort="descending"[^>]*>\s*Tasks\s*<\/th>/
      );

      const assignedSummaryIndex = response.text.indexOf('data-user-overview-layout="assigned-summary"');
      const assignedTableIndex = response.text.indexOf('data-user-overview-layout="assigned-table"');
      const completedSummaryIndex = response.text.indexOf('data-user-overview-layout="completed-summary"');
      const completedTableIndex = response.text.indexOf('data-user-overview-layout="completed-table"');

      expect(assignedSummaryIndex).toBeGreaterThan(-1);
      expect(assignedTableIndex).toBeGreaterThan(-1);
      expect(completedSummaryIndex).toBeGreaterThan(-1);
      expect(completedTableIndex).toBeGreaterThan(-1);
      expect(assignedSummaryIndex).toBeLessThan(assignedTableIndex);
      expect(completedSummaryIndex).toBeLessThan(completedTableIndex);
    });

    test('should render the assigned tasks partial for ajax requests', async () => {
      const response = await request(server)
        .get('/users?ajaxSection=user-overview-assigned')
        .set('X-Requested-With', 'fetch')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Currently assigned tasks');
      expect(response.text).toContain('C-123');
      expect(response.text).toContain('High');
      expect(response.text).not.toMatch(/>\s*high\s*</);
      expect(response.text).not.toContain('User overview');
      const assignedSummaryIndex = response.text.indexOf('data-user-overview-layout="assigned-summary"');
      const assignedTableIndex = response.text.indexOf('data-user-overview-layout="assigned-table"');
      expect(assignedSummaryIndex).toBeGreaterThan(-1);
      expect(assignedTableIndex).toBeGreaterThan(-1);
      expect(assignedSummaryIndex).toBeLessThan(assignedTableIndex);
    });

    test('should render the completed tasks partial for ajax requests', async () => {
      const response = await request(server)
        .get('/users?ajaxSection=user-overview-completed')
        .set('X-Requested-With', 'fetch')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Completed tasks');
      expect(response.text).not.toContain('User overview');
      const completedSummaryIndex = response.text.indexOf('data-user-overview-layout="completed-summary"');
      const completedTableIndex = response.text.indexOf('data-user-overview-layout="completed-table"');
      expect(completedSummaryIndex).toBeGreaterThan(-1);
      expect(completedTableIndex).toBeGreaterThan(-1);
      expect(completedSummaryIndex).toBeLessThan(completedTableIndex);
    });

    test('should fall back to the full page when ajaxSection is unknown', async () => {
      const response = await request(server)
        .get('/users?ajaxSection=unknown-section')
        .set('X-Requested-With', 'fetch')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('User overview');
    });
  });

  describe('on POST', () => {
    test('should reject requests without a CSRF token', async () => {
      const response = await request(server).post('/users').type('form').send({ user: '123' });

      expect(response.status).toBe(403);
    });

    test('should accept requests with a CSRF token', async () => {
      const agent = request.agent(server);
      const tokenResponse = await agent.get('/users').expect(200);
      const token = extractCsrfToken(tokenResponse.text);

      const response = await agent.post('/users').type('form').send({ _csrf: token, user: '123' }).expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('User overview');
    });
  });
});
