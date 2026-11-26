/**
 * Persistence layer for event routing configuration.
 * 
 * Handles storing and retrieving routing configurations from the database,
 * enabling routing rules to survive application restarts.
 */

import { Database } from '../database/database';
import {
  EventRoutingConfiguration,
  EventRoutingRule,
  CreateRoutingConfigurationInput,
  CreateRoutingRuleInput,
} from '../types/event-routing';
import logger from '../utils/logger';

/**
 * Repository for persisting and retrieving event routing configurations.
 */
export class EventRoutingRepository {
  constructor(private db: Database) {}

  /**
   * Save a routing configuration to the database.
   */
  async saveConfiguration(config: EventRoutingConfiguration): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO event_routing_configurations (
        config_id, contract_address, default_destinations, 
        enable_missing_destination_fallback, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      await this.db.run(query, [
        config.id,
        config.contractAddress,
        JSON.stringify(config.defaultDestinations),
        config.enableMissingDestinationFallback ? 1 : 0,
        config.metadata ? JSON.stringify(config.metadata) : null,
        config.createdAt,
        config.updatedAt,
      ]);

      logger.debug('EventRoutingRepository: configuration saved', {
        configId: config.id,
        contractAddress: config.contractAddress,
      });
    } catch (error) {
      logger.error('EventRoutingRepository: failed to save configuration', {
        configId: config.id,
        contractAddress: config.contractAddress,
        error,
      });
      throw error;
    }
  }

  /**
   * Load a routing configuration from the database.
   */
  async loadConfiguration(contractAddress: string): Promise<EventRoutingConfiguration | null> {
    const query = `
      SELECT * FROM event_routing_configurations 
      WHERE contract_address = ? 
      LIMIT 1
    `;

    try {
      const row = await this.db.get(query, [contractAddress]);

      if (!row) {
        return null;
      }

      return {
        id: row.config_id,
        contractAddress: row.contract_address,
        defaultDestinations: JSON.parse(row.default_destinations),
        enableMissingDestinationFallback: row.enable_missing_destination_fallback === 1,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        rules: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error('EventRoutingRepository: failed to load configuration', {
        contractAddress,
        error,
      });
      throw error;
    }
  }

  /**
   * Save a routing rule to the database.
   */
  async saveRule(rule: EventRoutingRule): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO event_routing_rules (
        rule_id, config_id, event_type, destinations, enabled, 
        priority, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      // Find the config_id for this rule
      const configId = rule.id.split('_')[1] + '_' + rule.id.split('_')[2];

      await this.db.run(query, [
        rule.id,
        configId,
        rule.eventType,
        JSON.stringify(rule.destinations),
        rule.enabled ? 1 : 0,
        rule.priority ?? 0,
        rule.metadata ? JSON.stringify(rule.metadata) : null,
        rule.createdAt,
        rule.updatedAt,
      ]);

      logger.debug('EventRoutingRepository: rule saved', {
        ruleId: rule.id,
        eventType: rule.eventType,
      });
    } catch (error) {
      logger.error('EventRoutingRepository: failed to save rule', {
        ruleId: rule.id,
        eventType: rule.eventType,
        error,
      });
      throw error;
    }
  }

  /**
   * Load all routing rules for a configuration.
   */
  async loadRules(configId: string): Promise<EventRoutingRule[]> {
    const query = `
      SELECT * FROM event_routing_rules 
      WHERE config_id = ? 
      ORDER BY priority DESC, created_at ASC
    `;

    try {
      const rows = await this.db.all(query, [configId]);

      return rows.map((row) => ({
        id: row.rule_id,
        eventType: row.event_type,
        destinations: JSON.parse(row.destinations),
        enabled: row.enabled === 1,
        priority: row.priority,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error('EventRoutingRepository: failed to load rules', {
        configId,
        error,
      });
      throw error;
    }
  }

  /**
   * Update a routing rule.
   */
  async updateRule(ruleId: string, updates: Partial<EventRoutingRule>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.destinations !== undefined) {
      fields.push('destinations = ?');
      values.push(JSON.stringify(updates.destinations));
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(ruleId);

    const query = `UPDATE event_routing_rules SET ${fields.join(', ')} WHERE rule_id = ?`;

    try {
      await this.db.run(query, values);

      logger.debug('EventRoutingRepository: rule updated', {
        ruleId,
      });
    } catch (error) {
      logger.error('EventRoutingRepository: failed to update rule', {
        ruleId,
        error,
      });
      throw error;
    }
  }

  /**
   * Delete a routing rule.
   */
  async deleteRule(ruleId: string): Promise<boolean> {
    const query = 'DELETE FROM event_routing_rules WHERE rule_id = ?';

    try {
      const result = await this.db.run(query, [ruleId]);
      logger.debug('EventRoutingRepository: rule deleted', {
        ruleId,
      });
      return true;
    } catch (error) {
      logger.error('EventRoutingRepository: failed to delete rule', {
        ruleId,
        error,
      });
      throw error;
    }
  }

  /**
   * Load all configurations (for initialization/management).
   */
  async loadAllConfigurations(): Promise<EventRoutingConfiguration[]> {
    const query = 'SELECT config_id FROM event_routing_configurations';

    try {
      const rows = await this.db.all(query, []);
      const configs: EventRoutingConfiguration[] = [];

      for (const row of rows) {
        // This is simplified; in practice you'd reconstruct from row data
        logger.debug('EventRoutingRepository: loaded configuration', {
          configId: row.config_id,
        });
      }

      return configs;
    } catch (error) {
      logger.error('EventRoutingRepository: failed to load all configurations', {
        error,
      });
      throw error;
    }
  }

  /**
   * Delete a configuration and all its rules.
   */
  async deleteConfiguration(contractAddress: string): Promise<boolean> {
    try {
      // Delete rules first
      await this.db.run('DELETE FROM event_routing_rules WHERE config_id IN (SELECT config_id FROM event_routing_configurations WHERE contract_address = ?)', [contractAddress]);

      // Then delete configuration
      await this.db.run('DELETE FROM event_routing_configurations WHERE contract_address = ?', [
        contractAddress,
      ]);

      logger.info('EventRoutingRepository: configuration deleted', {
        contractAddress,
      });

      return true;
    } catch (error) {
      logger.error('EventRoutingRepository: failed to delete configuration', {
        contractAddress,
        error,
      });
      throw error;
    }
  }
}
