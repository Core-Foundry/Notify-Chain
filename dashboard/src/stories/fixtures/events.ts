import type { BlockchainEvent } from '../../types/event';

export const sampleEvent: BlockchainEvent = {
  eventId: 'evt_notify_001',
  contractAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  eventName: 'TaskCreated',
  ledger: 512_348,
  type: 'contract',
  topic: ['task', 'created'],
  value: '10000000',
  txHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcd',
  receivedAt: Date.UTC(2026, 6, 24, 12, 0, 0),
  notificationStatus: 'active',
  read: false,
};

export const sampleSystemEvent: BlockchainEvent = {
  ...sampleEvent,
  eventId: 'evt_sys_002',
  eventName: 'NotificationExpired',
  type: 'system',
  notificationStatus: 'expired',
  value: '0',
};

export const sampleWithdrawalEvent: BlockchainEvent = {
  ...sampleEvent,
  eventId: 'evt_fin_003',
  eventName: 'Withdrawal',
  type: 'contract',
  value: '2500000',
};
