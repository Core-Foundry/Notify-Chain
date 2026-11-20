import dotenv from 'dotenv';
import { initializeDatabase } from '../database/database';
import { loadConfig, validateConfig } from '../config';
import { EventDeduplicationService } from '../services/event-deduplication-service';
import { LedgerRangeBackfillController } from '../services/ledger-range-backfill';
import { DiscordNotificationService } from '../services/discord-notification';
import logger from '../utils/logger';

dotenv.config();

/**
 * Operator entry point for a one-shot historical backfill over an explicit,
 * inclusive ledger range:
 *
 *   BACKFILL_START_LEDGER=100 BACKFILL_END_LEDGER=200 npm run backfill:ledger-range
 *
 * The live polling cursor is never touched; only processed_events rows are
 * written through the shared deduplication service.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  validateConfig(config);

  const startRaw = process.env.BACKFILL_START_LEDGER;
  const endRaw = process.env.BACKFILL_END_LEDGER;
  if (!startRaw || !endRaw) {
    throw new Error(
      'BACKFILL_START_LEDGER and BACKFILL_END_LEDGER must both be set to positive integers',
    );
  }

  const db = await initializeDatabase(config.databasePath);
  const controller = new LedgerRangeBackfillController({
    rpcUrl: config.stellarRpcUrl,
    contractConfigs: config.contractAddresses,
    backfillConfig: config.backfill ?? {},
    deduplicationService: new EventDeduplicationService(db),
    discordService: config.discord ? new DiscordNotificationService(config.discord) : null,
  });

  controller.subscribe((event) => {
    logger.info('Ledger range backfill progress', {
      type: event.type,
      status: event.state.status,
      request: event.state.request,
    });
  });

  const result = await controller.run(Number(startRaw), Number(endRaw));
  logger.info('Ledger range backfill finished', result);
}

main().catch((error) => {
  logger.error('Ledger range backfill failed', { error });
  process.exit(1);
});
