import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite';

import { MIGRATION_V1 } from './migration-v1';
import { MIGRATION_V2 } from './migration-v2';
import { MIGRATION_V3 } from './migration-v3';
import { MIGRATION_V4 } from './migration-v4';
import { MIGRATION_V5 } from './migration-v5';
import { MIGRATION_V6 } from './migration-v6';
import { MIGRATION_V7 } from './migration-v7';

export const DATABASE_MIGRATIONS: readonly capSQLiteVersionUpgrade[] = [
  MIGRATION_V1,
  MIGRATION_V2,
  MIGRATION_V3,
  MIGRATION_V4,
  MIGRATION_V5,
  MIGRATION_V6,
  MIGRATION_V7,
];
