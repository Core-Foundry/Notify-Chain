-- Scheduled Notifications Database Schema
-- SQLite Database Schema for storing and tracking scheduled notifications

-- Main table for scheduled notifications
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Notification content and metadata
  payload TEXT NOT NULL,                    -- JSON payload of the notification
  notification_type VARCHAR(50) NOT NULL,   -- Type: 'discord', 'email', 'webhook', etc.
  target_recipient TEXT NOT NULL,           -- User ID, webhook URL, or recipient identifier
  
  -- Scheduling information
  execute_at DATETIME NOT NULL,             -- When the notification should be sent
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  
  -- Processing metadata
  processing_started_at DATETIME,
  processing_completed_at DATETIME,
  processor_id VARCHAR(100),                -- Identifier of the worker processing this job
  lock_expires_at DATETIME,                 -- Distributed lock expiration for race condition prevention
  
  -- Error tracking
  last_error TEXT,
  error_details TEXT,                       -- JSON with full error context
  
  -- Additional metadata
  event_id TEXT,                            -- Reference to the original event (if applicable)
  contract_address TEXT,                    -- Stellar contract address (if applicable)
  priority INTEGER NOT NULL DEFAULT 5,      -- 1-10, lower = higher priority
  metadata TEXT                             -- Additional JSON metadata
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_status_execute_at 
  ON scheduled_notifications(status, execute_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_lock_expires 
  ON scheduled_notifications(lock_expires_at, status);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_created_at 
  ON scheduled_notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_event_id 
  ON scheduled_notifications(event_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_target 
  ON scheduled_notifications(target_recipient, status);

-- Notification execution history for auditing
CREATE TABLE IF NOT EXISTS notification_execution_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduled_notification_id INTEGER NOT NULL,
  execution_attempt INTEGER NOT NULL,
  execution_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL,              -- SUCCESS, FAILED, RETRY
  error_message TEXT,
  response_data TEXT,                       -- JSON response from notification service
  duration_ms INTEGER,
  
  FOREIGN KEY (scheduled_notification_id) REFERENCES scheduled_notifications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_execution_log_notification_id 
  ON notification_execution_log(scheduled_notification_id);

CREATE INDEX IF NOT EXISTS idx_execution_log_execution_time 
  ON notification_execution_log(execution_time);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_scheduled_notifications_timestamp 
AFTER UPDATE ON scheduled_notifications
FOR EACH ROW
BEGIN
  UPDATE scheduled_notifications 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE id = NEW.id;
END;

-- ===============================================
-- NOTIFICATION TEMPLATE SYSTEM SCHEMA
-- ===============================================

-- Main table for notification templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Template identification
  unique_key VARCHAR(100) NOT NULL UNIQUE,  -- e.g., 'welcome_email', 'payment_confirmation'
  name VARCHAR(255) NOT NULL,               -- Human-readable name
  description TEXT,                         -- Template purpose/usage description
  
  -- Template content
  channel_type VARCHAR(50) NOT NULL,        -- EMAIL, SMS, DISCORD, PUSH, WEBHOOK
  subject_template TEXT,                    -- Optional subject (for EMAIL, PUSH)
  body_template TEXT NOT NULL,              -- Main template content with {{placeholders}}
  
  -- Variable definitions
  variables TEXT NOT NULL,                  -- JSON array of required variable names
  default_values TEXT,                      -- JSON object with default values for optional variables
  
  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,       -- Template versioning for A/B testing
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),                  -- User/system that created template
  
  -- Validation
  last_validated_at DATETIME,
  validation_status VARCHAR(20) DEFAULT 'PENDING' -- VALID, INVALID, PENDING
);

-- Indexes for template lookups
CREATE INDEX IF NOT EXISTS idx_templates_unique_key 
  ON notification_templates(unique_key);

CREATE INDEX IF NOT EXISTS idx_templates_channel_type 
  ON notification_templates(channel_type, is_active);

CREATE INDEX IF NOT EXISTS idx_templates_active 
  ON notification_templates(is_active, created_at);

-- Template usage tracking for analytics
CREATE TABLE IF NOT EXISTS template_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  rendered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  context_hash VARCHAR(64),                 -- Hash of the context data for deduplication
  success BOOLEAN NOT NULL DEFAULT 1,
  error_message TEXT,
  render_duration_ms INTEGER,
  
  FOREIGN KEY (template_id) REFERENCES notification_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_template_usage_template_id 
  ON template_usage_log(template_id, rendered_at);

CREATE INDEX IF NOT EXISTS idx_template_usage_rendered_at 
  ON template_usage_log(rendered_at);

-- Trigger to update template updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_notification_templates_timestamp 
AFTER UPDATE ON notification_templates
FOR EACH ROW
BEGIN
  UPDATE notification_templates 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE id = NEW.id;
END;
