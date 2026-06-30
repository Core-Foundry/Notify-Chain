/**
 * Template API Route Handlers
 * Provides HTTP request handlers for template CRUD operations
 */

import http from 'http';
import { TemplateService } from '../services/template-service';
import logger from '../utils/logger';

interface TemplateRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  requestId: string;
  templateService: TemplateService;
}

/**
 * Parse request body as JSON
 */
async function parseBody(req: http.IncomingMessage): Promise<any> {
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
function sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Handle POST /api/templates - Create template
 */
export async function handleCreateTemplate(ctx: TemplateRouteContext): Promise<void> {
  const { req, res, requestId, templateService } = ctx;

  try {
    const body = await parseBody(req);

    // Validate required fields
    if (!body.uniqueKey || !body.name || !body.channelType || !body.bodyTemplate) {
      sendJson(res, 400, {
        error: 'Missing required fields',
        required: ['uniqueKey', 'name', 'channelType', 'bodyTemplate'],
      });
      return;
    }

    const templateId = await templateService.createTemplate({
      uniqueKey: body.uniqueKey,
      name: body.name,
      description: body.description,
      channelType: body.channelType,
      subjectTemplate: body.subjectTemplate,
      bodyTemplate: body.bodyTemplate,
      variables: body.variables || [],
      defaultValues: body.defaultValues || {},
      createdBy: body.createdBy,
    });

    sendJson(res, 201, { id: templateId, uniqueKey: body.uniqueKey });

    logger.info('Template created via API', {
      requestId,
      templateId,
      uniqueKey: body.uniqueKey,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create template', { error, requestId });

    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      sendJson(res, 400, { error: errorMessage });
    } else if (errorMessage.includes('UNIQUE constraint')) {
      sendJson(res, 409, { error: 'Template with this unique key already exists' });
    } else {
      sendJson(res, 500, { error: 'Internal server error' });
    }
  }
}

/**
 * Handle GET /api/templates - List templates
 */
export async function handleListTemplates(ctx: TemplateRouteContext): Promise<void> {
  const { req, res, requestId, templateService } = ctx;

  try {
    const url = new URL(req.url!, 'http://localhost');
    const channelType = url.searchParams.get('channelType') || undefined;
    const activeOnly = url.searchParams.get('activeOnly') === 'true';

    const templates = await templateService.listTemplates({ channelType, activeOnly });

    sendJson(res, 200, {
      count: templates.length,
      templates,
    });

    logger.info('Listed templates via API', {
      requestId,
      count: templates.length,
      channelType,
      activeOnly,
    });
  } catch (error) {
    logger.error('Failed to list templates', { error, requestId });
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

/**
 * Handle GET /api/templates/:id - Get template by ID
 */
export async function handleGetTemplate(ctx: TemplateRouteContext): Promise<void> {
  const { req, res, requestId, templateService } = ctx;

  try {
    const id = parseInt(req.url!.split('/').pop() || '', 10);
    if (isNaN(id)) {
      sendJson(res, 400, { error: 'Invalid template ID' });
      return;
    }

    const template = await templateService.getTemplateById(id);
    if (!template) {
      sendJson(res, 404, { error: 'Template not found' });
      return;
    }

    sendJson(res, 200, template);

    logger.info('Retrieved template via API', { requestId, templateId: id });
  } catch (error) {
    logger.error('Failed to get template', { error, requestId });
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

/**
 * Handle GET /api/templates/by-key/:uniqueKey - Get template by unique key
 */
export async function handleGetTemplateByKey(ctx: TemplateRouteContext): Promise<void> {
  const { req, res, requestId, templateService } = ctx;

  try {
    const uniqueKey = req.url!.split('/').pop();
    if (!uniqueKey) {
      sendJson(res, 400, { error: 'Missing unique key' });
      return;
    }

    const template = await templateService.getTemplateByKey(uniqueKey);
    if (!template) {
      sendJson(res, 404, { error: 'Template not found' });
      return;
    }

    sendJson(res, 200, template);

    logger.info('Retrieved template by key via API', { requestId, uniqueKey });
  } catch (error) {
    logger.error('Failed to get template by key', { error, requestId });
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

/**
 * Handle PUT /api/templates/:id - Update template
 */
export async function handleUpdateTemplate(ctx: TemplateRouteContext): Promise<void> {
  const { req, res, requestId, templateService } = ctx;

  try {
    const id = parseInt(req.url!.split('/').pop() || '', 10);
    if (isNaN(id)) {
      sendJson(res, 400, { error: 'Invalid template ID' });
      return;
    }

    const body = await parseBody(req);

    await templateService.updateTemplate(id, body);

    sendJson(res, 200, { id, message: 'Template updated successfully' });

    logger.info('Updated template via API', { requestId, templateId: id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to update template', { error, requestId });

    if (errorMessage.includes('not found')) {
      sendJson(res, 404, { error: 'Template not found' });
    } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      sendJson(res, 400, { error: errorMessage });
    } else {
      sendJson(res, 500, { error: 'Internal server error' });
    }
  }
}

/**
 * Handle DELETE /api/templates/:id - Delete/deactivate template
 */
export async function handleDeleteTemplate(ctx: TemplateRouteContext): Promise<void> {
  const { req, res, requestId, templateService } = ctx;

  try {
    const url = new URL(req.url!, 'http://localhost');
    const id = parseInt(url.pathname.split('/').pop() || '', 10);
    if (isNaN(id)) {
      sendJson(res, 400, { error: 'Invalid template ID' });
      return;
    }

    const hardDelete = url.searchParams.get('hard') === 'true';

    if (hardDelete) {
      await templateService.deleteTemplate(id);
    } else {
      await templateService.deactivateTemplate(id);
    }

    sendJson(res, 200, {
      id,
      message: hardDelete ? 'Template deleted permanently' : 'Template deactivated',
    });

    logger.info('Deleted/deactivated template via API', {
      requestId,
      templateId: id,
      hardDelete,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to delete template', { error, requestId });

    if (errorMessage.includes('not found')) {
      sendJson(res, 404, { error: 'Template not found' });
    } else {
      sendJson(res, 500, { error: 'Internal server error' });
    }
  }
}

/**
 * Handle POST /api/templates/render - Render template
 */
export async function handleRenderTemplate(ctx: TemplateRouteContext): Promise<void> {
  const { req, res, requestId, templateService } = ctx;

  try {
    const body = await parseBody(req);

    // Validate required fields
    if ((!body.templateId && !body.uniqueKey) || !body.context) {
      sendJson(res, 400, {
        error: 'Missing required fields',
        required: ['templateId OR uniqueKey', 'context'],
      });
      return;
    }

    let result;
    if (body.templateId) {
      result = await templateService.renderTemplateById(body.templateId, body.context);
    } else {
      result = await templateService.renderTemplateByKey(body.uniqueKey, body.context);
    }

    sendJson(res, 200, result);

    logger.info('Rendered template via API', {
      requestId,
      templateId: body.templateId,
      uniqueKey: body.uniqueKey,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to render template', { error, requestId });

    if (errorMessage.includes('not found')) {
      sendJson(res, 404, { error: 'Template not found' });
    } else if (
      errorMessage.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('required')
    ) {
      sendJson(res, 400, { error: errorMessage });
    } else {
      sendJson(res, 500, { error: 'Internal server error' });
    }
  }
}

/**
 * Handle GET /api/templates/stats - Get template statistics
 */
export async function handleGetTemplateStats(ctx: TemplateRouteContext): Promise<void> {
  const { req, res, requestId, templateService } = ctx;

  try {
    const url = new URL(req.url!, 'http://localhost');
    const idParam = url.searchParams.get('templateId');
    const templateId = idParam ? parseInt(idParam, 10) : undefined;

    const stats = await templateService.getTemplateStats(templateId);

    sendJson(res, 200, stats);

    logger.info('Retrieved template stats via API', { requestId, templateId });
  } catch (error) {
    logger.error('Failed to get template stats', { error, requestId });
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

/**
 * Route template requests to appropriate handlers
 */
export async function handleTemplateRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  requestId: string,
  templateService: TemplateService
): Promise<boolean> {
  const url = req.url || '';
  const method = req.method || 'GET';

  const ctx: TemplateRouteContext = { req, res, requestId, templateService };

  // POST /api/templates - Create template
  if (method === 'POST' && url === '/api/templates') {
    await handleCreateTemplate(ctx);
    return true;
  }

  // GET /api/templates - List templates
  if (method === 'GET' && url.startsWith('/api/templates') && url.split('/').length === 3) {
    await handleListTemplates(ctx);
    return true;
  }

  // POST /api/templates/render - Render template
  if (method === 'POST' && url === '/api/templates/render') {
    await handleRenderTemplate(ctx);
    return true;
  }

  // GET /api/templates/stats - Get statistics
  if (method === 'GET' && url.startsWith('/api/templates/stats')) {
    await handleGetTemplateStats(ctx);
    return true;
  }

  // GET /api/templates/by-key/:uniqueKey - Get by unique key
  if (method === 'GET' && url.match(/^\/api\/templates\/by-key\/.+/)) {
    await handleGetTemplateByKey(ctx);
    return true;
  }

  // GET /api/templates/:id - Get template by ID
  if (method === 'GET' && url.match(/^\/api\/templates\/\d+$/)) {
    await handleGetTemplate(ctx);
    return true;
  }

  // PUT /api/templates/:id - Update template
  if (method === 'PUT' && url.match(/^\/api\/templates\/\d+$/)) {
    await handleUpdateTemplate(ctx);
    return true;
  }

  // DELETE /api/templates/:id - Delete template
  if (method === 'DELETE' && url.match(/^\/api\/templates\/\d+/)) {
    await handleDeleteTemplate(ctx);
    return true;
  }

  return false;
}
