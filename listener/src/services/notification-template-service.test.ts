import { Database } from '../database/database';
import { NotificationTemplateCache } from './notification-template-cache';
import { NotificationTemplateRepository } from './notification-template-repository';
import { NotificationTemplateService, TemplateRenderError } from './notification-template-service';
import { TemplateAuditTrail } from './template-audit-trail';

describe('NotificationTemplateService', () => {
  let db: Database;
  let service: NotificationTemplateService;
  let cache: NotificationTemplateCache;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.initialize();
    cache = new NotificationTemplateCache(60, 0);
    const repository = new NotificationTemplateRepository(db, new TemplateAuditTrail(db), cache);
    service = new NotificationTemplateService(repository, cache);
  });

  afterEach(async () => {
    await db.close();
  });

  it('routes updates through the repository and invalidates cache', async () => {
    await service.create({
      id: 'svc-template',
      name: 'Service Template',
      type: 'email',
      body: 'Original body',
    });

    const cached = await service.getById('svc-template');
    expect(cached?.body).toBe('Original body');
    expect(cache.has('svc-template')).toBe(true);

    await service.update('svc-template', { body: 'Updated body' }, 'service-admin');

    expect(cache.has('svc-template')).toBe(false);
    const refreshed = await service.getById('svc-template');
    expect(refreshed?.body).toBe('Updated body');

    const history = await service.getAuditHistory('svc-template');
    expect(history).toHaveLength(1);
    expect(history[0].actor).toBe('service-admin');
  });

  it('listAll returns all created templates', async () => {
    await service.create({ id: 'tmpl-a', name: 'A', type: 'email', body: 'Body A' });
    await service.create({ id: 'tmpl-b', name: 'B', type: 'sms', body: 'Body B' });

    const all = await service.listAll();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.some((t) => t.id === 'tmpl-a')).toBe(true);
    expect(all.some((t) => t.id === 'tmpl-b')).toBe(true);
  });

  it('delete removes a template and invalidates cache', async () => {
    await service.create({ id: 'del-tmpl', name: 'Delete Me', type: 'email', body: 'Bye' });
    await service.getById('del-tmpl'); // populate cache
    expect(cache.has('del-tmpl')).toBe(true);

    await service.delete('del-tmpl');

    expect(cache.has('del-tmpl')).toBe(false);
    expect(await service.getById('del-tmpl')).toBeUndefined();
  });

  describe('renderTemplate', () => {
    it('substitutes declared variables', async () => {
      const template = await service.create({
        id: 'render-tmpl',
        name: 'Render Test',
        type: 'email',
        subject: 'Hello {{name}}',
        body: 'Dear {{name}}, your code is {{code}}.',
        variables: ['name', 'code'],
      });

      const result = service.renderTemplate(template, { name: 'Alice', code: '123' });
      expect(result.subject).toBe('Hello Alice');
      expect(result.body).toBe('Dear Alice, your code is 123.');
    });

    it('throws TemplateRenderError when a required variable is missing', async () => {
      const template = await service.create({
        id: 'render-missing',
        name: 'Missing Var',
        type: 'email',
        body: 'Hello {{name}}',
        variables: ['name'],
      });

      expect(() => service.renderTemplate(template, {})).toThrow(TemplateRenderError);
      expect(() => service.renderTemplate(template, {})).toThrow(/missing required variables/i);
    });

    it('renders a template with no declared variables', async () => {
      const template = await service.create({
        id: 'no-vars',
        name: 'No Vars',
        type: 'email',
        body: 'Static body with no placeholders',
      });

      const result = service.renderTemplate(template, {});
      expect(result.body).toBe('Static body with no placeholders');
    });
  });
});
