/**
 * NotifyChain Client SDK — Usage Examples (#990)
 *
 * Common integration scenarios showing how to use the typed SDK.
 */

import {
  NotifyChainClient,
  NotifyChainApiError,
} from './notify-chain-client';

// ─── Example 1: Basic event fetching ──────────────────────────────────────────

async function fetchRecentEvents() {
  const client = new NotifyChainClient({
    baseUrl: process.env.LISTENER_URL ?? 'http://localhost:8787',
    apiKey: process.env.LISTENER_API_KEY,
  });

  try {
    const result = await client.getEvents({ limit: 50 });
    console.log(`Fetched ${result.events.length} events`);
    for (const event of result.events) {
      console.log(`  [${event.type}] ${event.contract} @ ledger ${event.ledger}`);
    }
    if (result.pagination.hasMore) {
      console.log('More events available — use cursor for next page');
    }
  } catch (err) {
    if (err instanceof NotifyChainApiError && err.isAuthError()) {
      console.error('Authentication failed — check your API key');
    } else {
      console.error('Failed to fetch events:', err);
    }
  }
}

// ─── Example 2: Schedule a notification ──────────────────────────────────────

async function scheduleDiscordNotification() {
  const client = new NotifyChainClient({
    baseUrl: 'http://localhost:8787',
    apiKey: 'nc_live_your_key_here',
  });

  try {
    const notification = await client.scheduleNotification({
      type: 'discord',
      payload: { message: 'New task created!' },
      priority: 'high',
      maxRetries: 5,
    });
    console.log(`Scheduled notification #${notification.id}`);
  } catch (err) {
    if (err instanceof NotifyChainApiError) {
      console.error(`API error (${err.code}): ${err.message}`);
    }
  }
}

// ─── Example 3: Query usage statistics ──────────────────────────────────────

async function checkClientUsage() {
  const client = new NotifyChainClient({
    baseUrl: 'http://localhost:8787',
    apiKey: 'nc_live_admin_key_here',
  });

  const summaries = await client.getUsage({
    since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  });

  for (const summary of summaries) {
    console.log(`Client ${summary.clientName ?? summary.clientId}:`);
    console.log(`  Total: ${summary.totalRequests}`);
    console.log(`  Success rate: ${(summary.successfulRequests / summary.totalRequests * 100).toFixed(1)}%`);
    console.log(`  Avg latency: ${summary.averageResponseTimeMs}ms`);
  }
}

// ─── Example 4: Template management ──────────────────────────────────────────

async function manageTemplates() {
  const client = new NotifyChainClient({
    baseUrl: 'http://localhost:8787',
    apiKey: 'nc_live_your_key_here',
  });

  // Create a template
  await client.createTemplate({
    id: 'welcome-discord',
    name: 'Welcome Message',
    type: 'discord',
    body: 'Welcome {{username}} to the group!',
  });

  // Render it with context
  const rendered = await client.renderTemplate('welcome-discord', {
    username: 'Alice',
  });
  console.log('Rendered:', rendered);

  // List all templates
  const templates = await client.listTemplates();
  console.log(`${templates.length} templates configured`);
}

// ─── Example 5: Error handling patterns ──────────────────────────────────────

async function resilientEventFetch() {
  const client = new NotifyChainClient({
    baseUrl: 'http://localhost:8787',
    apiKey: process.env.LISTENER_API_KEY,
    timeoutMs: 10_000,
  });

  try {
    const events = await client.getEvents({ limit: 100 });
    return events;
  } catch (err) {
    if (err instanceof NotifyChainApiError) {
      if (err.isRateLimited()) {
        console.log('Rate limited — backing off');
      } else if (err.isServerError()) {
        console.log('Server error — will retry later');
      } else if (err.isAuthError()) {
        console.log('Auth error — credentials may be expired');
      }
    }
    throw err;
  }
}

// Run examples if executed directly
if (require.main === module) {
  fetchRecentEvents().catch(console.error);
}
