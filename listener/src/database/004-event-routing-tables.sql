-- ===============================================
-- EVENT ROUTING CONFIGURATION TABLES (migration 004)
-- Enables configurable event-to-destination routing
-- ===============================================

-- Event routing configurations for contracts
CREATE TABLE IF NOT EXISTS event_routing_configurations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id TEXT NOT NULL UNIQUE,
  contract_address TEXT NOT NULL UNIQUE,
  default_destinations TEXT NOT NULL,           -- JSON array of default destination names
  enable_missing_destination_fallback BOOLEAN NOT NULL DEFAULT 1,
  metadata TEXT,                                -- JSON metadata
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_routing_configurations_contract
  ON event_routing_configurations(contract_address);

CREATE INDEX IF NOT EXISTS idx_event_routing_configurations_updated_at
  ON event_routing_configurations(updated_at);

-- Event routing rules for specific event types
CREATE TABLE IF NOT EXISTS event_routing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL UNIQUE,
  config_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  destinations TEXT NOT NULL,                   -- JSON array of destination names
  enabled BOOLEAN NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,                                -- JSON metadata
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (config_id) REFERENCES event_routing_configurations(config_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_routing_rules_config_enabled
  ON event_routing_rules(config_id, enabled);

CREATE INDEX IF NOT EXISTS idx_event_routing_rules_config_priority
  ON event_routing_rules(config_id, priority DESC);

CREATE INDEX IF NOT EXISTS idx_event_routing_rules_event_type
  ON event_routing_rules(event_type);

CREATE INDEX IF NOT EXISTS idx_event_routing_rules_enabled_updated
  ON event_routing_rules(enabled, updated_at);

-- Audit trail for routing configuration changes
CREATE TABLE IF NOT EXISTS event_routing_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATED', 'UPDATED', 'DELETED', 'RULE_ADDED', 'RULE_UPDATED', 'RULE_DELETED')),
  actor TEXT,                                   -- Who made the change
  previous_state TEXT,                         -- JSON snapshot of previous state
  new_state TEXT,                              -- JSON snapshot of new state
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_event_routing_audit_config_id
  ON event_routing_audit_log(config_id);

CREATE INDEX IF NOT EXISTS idx_event_routing_audit_created_at
  ON event_routing_audit_log(created_at);

CREATE INDEX IF NOT EXISTS idx_event_routing_audit_action
  ON event_routing_audit_log(action);

-- Destination validation cache to avoid repeated provider lookups
CREATE TABLE IF NOT EXISTS destination_validation_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  destination TEXT NOT NULL UNIQUE,
  is_valid BOOLEAN NOT NULL,
  provider_id TEXT,
  last_validated_at INTEGER NOT NULL,
  cached_until INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_destination_validation_cache_destination
  ON destination_validation_cache(destination);

CREATE INDEX IF NOT EXISTS idx_destination_validation_cache_valid
  ON destination_validation_cache(is_valid);

CREATE INDEX IF NOT EXISTS idx_destination_validation_cache_expires
  ON destination_validation_cache(cached_until);

-- Immutable audit trigger for routing configurations
CREATE TRIGGER IF NOT EXISTS prevent_routing_audit_delete
BEFORE DELETE ON event_routing_audit_log
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Event routing audit records are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_routing_audit_update
BEFORE UPDATE ON event_routing_audit_log
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Event routing audit records are immutable');
END;
