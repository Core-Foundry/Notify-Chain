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
