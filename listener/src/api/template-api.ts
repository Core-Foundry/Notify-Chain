/**
 * Notification Template REST API
 * 
 * HTTP endpoints for template CRUD operations
 * - POST   /api/templates        - Create template
 * - GET    /api/templates        - List templates
 * - GET    /api/templates/:id    - Get template by ID
 * - PUT    /api/templates/:id    - Update template
 * - DELETE /api/templates/:id    - Delete template
 * - POST   /api/templates/render - Render template
 * - GET    /api/templates/stats  - Get statistics
 */

import * as http from 'http';
import { TemplateService } from '../services/template-service';
import logger from '../utils/logger';
import { TemplateChannelType } from '../types/notification-template';

export interface TemplateAPIOptions {
  templateService: TemplateService;
  corsOrigin?: string;
}

/**
 * Parse JSON body from request
 */
function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJSON(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Template API Request Handler
 */
export function createTemplateAPIHandler(options: TemplateAPIOptions) {
  const { templateService, corsOrigin = '*' } = options;

  return async (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const pathname = url.pathname;

      // POST /api/templates - Create template
      if (req.method === 'POST' && pathname === '/api/templates') {
        const body = await parseBody(req);

        // Validate required fields
        if (!body.uniqueKey || !body.name || !body.channelType || !body.bodyTemplate) {
          sendJSON(res, 400, {
            error: 'Missing required fields: uniqueKey, name, channelType, bodyTemplate',
          });
          return;
        }

        const result = await templateService.createTemplate(body);

        if (!result.success) {
          sendJSON(res, 400, {
            error: result.error,
            validation: result.validation,
          });
          return;
        }

        sendJSON(res, 201, {
          id: result.templateId,
          message: 'Template created successfully',
          validation: result.validation,
        });
        return;
      }

      // GET /api/templates - List templates
      if (req.method === 'GET' && pathname === '/api/templates') {
        const channelType = url.searchParams.get('channelType') as TemplateChannelType | null;
        const isActive = url.searchParams.get('isActive');
        const limit = url.searchParams.get('limit');
        const offset = url.searchParams.get('offset');

        const templates = await templateService.listTemplates({
          channelType: channelType || undefined,
          isActive: isActive ? isActive === 'true' : undefined,
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
        });

        sendJSON(res, 200, {
          count: templates.length,
          templates,
        });
        return;
      }

      // GET /api/templates/stats - Get statistics
      if (req.method === 'GET' && pathname === '/api/templates/stats') {
        const stats = await templateService.getOverviewStats();
        sendJSON(res, 200, stats);
        return;
      }

      // GET /api/templates/:id - Get template by ID
      if (req.method === 'GET' && pathname.startsWith('/api/templates/')) {
        const id = parseInt(pathname.split('/').pop() || '', 10);

        if (isNaN(id)) {
          sendJSON(res, 400, { error: 'Invalid template ID' });
          return;
        }

        const template = await templateService.getTemplate(id);

        if (!template) {
          sendJSON(res, 404, { error: 'Template not found' });
          return;
        }

        sendJSON(res, 200, template);
        return;
      }

      // PUT /api/templates/:id - Update template
      if (req.method === 'PUT' && pathname.startsWith('/api/templates/')) {
        const id = parseInt(pathname.split('/').pop() || '', 10);

        if (isNaN(id)) {
          sendJSON(res, 400, { error: 'Invalid template ID' });
          return;
        }

        const body = await parseBody(req);
        const result = await templateService.updateTemplate(id, body);

        if (!result.success) {
          sendJSON(res, 400, {
            error: result.error,
            validation: result.validation,
          });
          return;
        }

        sendJSON(res, 200, {
          message: 'Template updated successfully',
          validation: result.validation,
        });
        return;
      }

      // DELETE /api/templates/:id - Delete template
      if (req.method === 'DELETE' && pathname.startsWith('/api/templates/')) {
        const id = parseInt(pathname.split('/').pop() || '', 10);

        if (isNaN(id)) {
          sendJSON(res, 400, { error: 'Invalid template ID' });
          return;
        }

        // Check query parameter for hard delete
        const hardDelete = url.searchParams.get('hard') === 'true';

        const success = hardDelete
          ? await templateService.deleteTemplate(id)
          : await templateService.deactivateTemplate(id);

        if (!success) {
          sendJSON(res, 404, { error: 'Template not found' });
          return;
        }

        sendJSON(res, 200, {
          message: hardDelete ? 'Template deleted permanently' : 'Template deactivated',
        });
        return;
      }

      // POST /api/templates/render - Render template
      if (req.method === 'POST' && pathname === '/api/templates/render') {
        const body = await parseBody(req);

        if (!body.template || !body.context) {
          sendJSON(res, 400, {
            error: 'Missing required fields: template (ID or uniqueKey), context',
          });
          return;
        }

        const result = await templateService.renderTemplate(body.template, body.context);

        if (!result.success) {
          sendJSON(res, 400, {
            error: result.error,
            missingVariables: result.missingVariables,
          });
          return;
        }

        sendJSON(res, 200, {
          rendered: result.rendered,
        });
        return;
      }

      // GET /api/templates/:id/stats - Get template usage stats
      if (req.method === 'GET' && pathname.match(/^\/api\/templates\/\d+\/stats$/)) {
        const id = parseInt(pathname.split('/')[3], 10);

        const stats = await templateService.getTemplateStats(id);
        sendJSON(res, 200, stats);
        return;
      }

      // Not found
      sendJSON(res, 404, { error: 'Endpoint not found' });
    } catch (error) {
      logger.error('Template API error', { error, path: url.pathname });
      sendJSON(res, 500, {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
import { resolveRequestActor } from '../utils/request-actor';
import {
  NotificationTemplate,
  TemplateAuditRecord,
  UpdateNotificationTemplateInput,
} from '../types/notification-template';

export function serializeTemplate(template: NotificationTemplate): Record<string, unknown> {
  return {
    ...template,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

export function serializeAuditRecord(record: TemplateAuditRecord): Record<string, unknown> {
  return {
    id: record.id,
    templateId: record.templateId,
    actor: record.actor,
    action: record.action,
    changedAt: record.changedAt.toISOString(),
    previousSnapshot: serializeTemplate(normalizeSnapshot(record.previousSnapshot)),
    newSnapshot: serializeTemplate(normalizeSnapshot(record.newSnapshot)),
  };
}

function normalizeSnapshot(snapshot: NotificationTemplate): NotificationTemplate {
  return {
    ...snapshot,
    createdAt: snapshot.createdAt instanceof Date
      ? snapshot.createdAt
      : new Date(snapshot.createdAt as unknown as string),
    updatedAt: snapshot.updatedAt instanceof Date
      ? snapshot.updatedAt
      : new Date(snapshot.updatedAt as unknown as string),
  };
}

export function parseTemplateUpdateBody(body: unknown): UpdateNotificationTemplateInput {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid body: expected a template update object');
  }

  const input = body as Record<string, unknown>;
  const update: UpdateNotificationTemplateInput = {};

  if ('name' in input) {
    if (typeof input.name !== 'string') {
      throw new Error('Invalid body: name must be a string');
    }
    update.name = input.name;
  }
  if ('type' in input) {
    if (typeof input.type !== 'string') {
      throw new Error('Invalid body: type must be a string');
    }
    update.type = input.type;
  }
  if ('subject' in input) {
    if (input.subject !== undefined && input.subject !== null && typeof input.subject !== 'string') {
      throw new Error('Invalid body: subject must be a string');
    }
    update.subject = input.subject as string | undefined;
  }
  if ('body' in input) {
    if (typeof input.body !== 'string') {
      throw new Error('Invalid body: body must be a string');
    }
    update.body = input.body;
  }
  if ('variables' in input) {
    if (!Array.isArray(input.variables) || input.variables.some((v) => typeof v !== 'string')) {
      throw new Error('Invalid body: variables must be an array of strings');
    }
    update.variables = input.variables;
  }
  if ('metadata' in input) {
    if (input.metadata !== null && (typeof input.metadata !== 'object' || Array.isArray(input.metadata))) {
      throw new Error('Invalid body: metadata must be an object');
    }
    update.metadata = input.metadata as Record<string, unknown>;
  }

  if (Object.keys(update).length === 0) {
    throw new Error('Invalid body: at least one template field must be provided');
  }

  return update;
}

export { resolveRequestActor };
