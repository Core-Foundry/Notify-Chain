      });
      req.on('end', () => {
        try {
          const input: PreferencesUpdateInput = JSON.parse(body);
          if (!input || typeof input.categories !== 'object') {
            logger.warn('PUT /api/preferences/:userId invalid body', {
              requestId,
              correlationId,
              userId,
            });
            sendErr(
              res,
              400,
              'Invalid body: expected { categories: { [key]: boolean } }',
              ErrorCode.BAD_REQUEST,
            );
            return;
          }
          const updated = preferenceStore.update(userId, input);
          logger.info('PUT /api/preferences/:userId complete', {
            requestId,
            correlationId,
            userId,
            durationMs: Date.now() - startTime,
          });
          sendOk(res, 200, updated);
        } catch {
          logger.error('PUT /api/preferences/:userId invalid JSON', {
            requestId,
            correlationId,
            userId,
          });
          sendErr(res, 400, 'Invalid JSON', ErrorCode.PARSE_ERROR);
        }
      });
      return;
    }

    // GET /api/archive, GET /api/archive/:id, POST /api/archive/run
    if (
      options.archiveStore &&
      (url.pathname === '/api/archive' || url.pathname.startsWith('/api/archive/'))
    ) {
      const handled = await handleArchiveRequest(
        req,
        res,
        {
          store: options.archiveStore,
          service: options.archiveService,
        },
        requestId,
      );
      if (handled) return;
    }

    // GET /api/notifications/delivery-metrics and /history  (Issue #482)
    const deliveryMetricsHandled = handleDeliveryMetricsRequest(
      req,
      res,
      url,
      {
        analyticsAggregator: options.analyticsAggregator,
        metricsStore: options.metricsStore,
      },
      { requestId, correlationId, startTime },
    );
    if (deliveryMetricsHandled) return;

    // GET /api/metrics/response-time — expose response-time counters (#491)
    if (req.method === 'GET' && url.pathname === '/api/metrics/response-time') {
      const metrics = responseTime.getMetrics();
      const reset = url.searchParams.get('reset') === 'true';
      sendOk(res, 200, metrics);
      if (reset) {
        responseTime.resetMetrics();
        logger.info('Response-time metrics reset', { requestId });
      }
      return;
    }

    logger.warn('Unhandled request', {
      requestId,
      correlationId,
      method: req.method,
      url: req.url,
    });
    sendErr(res, 404, 'Not found', ErrorCode.NOT_FOUND);
    responseTime.finish(req, res, requestId, 404);
  };

  // Per-client usage accounting (#989): record the resolved non-secret client
  // identifier, route, method and status once the response is finished. The
  // recorder is fire-and-forget so it never blocks or fails the request, and
  // only the sanitized client id is passed through — never raw credentials.
  const recordUsage = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const usageAccounting = options.usageAccounting;
    if (!usageAccounting) return;
    try {
      const clientId = resolveUsageClientId(req);
      const route = resolveUsageRoute(req);
      const status = res.statusCode;
      void Promise.resolve(
        usageAccounting.record({
          clientId,
          method: req.method ?? 'UNKNOWN',
          route,
          status,
        }),
      ).catch((error: unknown) => {
        logger.warn('Usage accounting record failed', { error });
      });
    } catch (error: unknown) {
      logger.warn('Usage accounting record failed', { error });
    }
  };

  const server = http.createServer((req, res) => {
    // Usage accounting (#989): attach a one-shot listener so the record is
    // written after the response completes, regardless of which branch handled
    // the request. Non-blocking and never throws into the request path.
    res.once('finish', () => recordUsage(req, res));
    // Request-ID + correlation middleware (#686, #986): assigns (or
    // validates+reuses) a requestId and correlationId, stamps both onto the
    // response headers, and runs the handler inside an AsyncLocalStorage
    // context so logs, error envelopes and queued jobs inherit them.
    runWithRequestCorrelation(req, res, (requestContext) =>
      handleRequest(req, res, requestContext),
    ).catch((error: unknown) => {
      logger.error('Unhandled error in events server request handler', { error });
      if (!res.headersSent) {
        sendErr(res, 500, 'Internal server error', ErrorCode.INTERNAL_ERROR);
      } else {
        res.end();
      }
    });
  });

  if (rateLimiter) {
    const originalClose = server.close.bind(server);
    server.close = (callback?: (err?: Error) => void) => {
      rateLimiter.destroy();
      return originalClose(callback);
    };
  }

  return server;
}

/**
 * Resolve the non-secret client identifier used for usage accounting (#989).
 * Prefers an explicit authenticated principal attached by the authorization
 * layer; falls back to a stable, non-reversible hash of the presented
 * credential so distinct clients remain distinguishable without storing the
 * secret itself. Never returns raw credential material.
 */
function resolveUsageClientId(req: http.IncomingMessage): string {
  const principal = (req as http.IncomingMessage & {
    principal?: { clientId?: string; id?: string };
  }).principal;
  if (principal?.clientId) return principal.clientId;
  if (principal?.id) return principal.id;

  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.length > 0) {
    return `cred:${createHash('sha256').update(authHeader).digest('hex').slice(0, 16)}`;
  }
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    return `key:${createHash('sha256').update(apiKey).digest('hex').slice(0, 16)}`;
  }
  return 'anonymous';
}

/**
 * Resolve a low-cardinality route label for usage accounting (#989). Strips
 * the query string and collapses path segments that look like identifiers so
 * aggregation stays bounded and no sensitive values leak into records.
 */
function resolveUsageRoute(req: http.IncomingMessage): string {
  const rawUrl = req.url ?? '/';
  const pathname = rawUrl.split('?')[0] ?? '/';
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const normalized = segments.map((segment) =>
    /^[0-9a-fA-F-]{8,}$/.test(segment) || /^\d+$/.test(segment) ? ':id' : segment,
  );
  return `/${normalized.join('/')}`;
}

export function startEventsServer(options: EventsServerOptions): http.Server {
  const server = createEventsServer(options);
  server.listen(options.port, () => {
    logger.info('Events API server listening', { port: options.port });
  });
  return server;
}
