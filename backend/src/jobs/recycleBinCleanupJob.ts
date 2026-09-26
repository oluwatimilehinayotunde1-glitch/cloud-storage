import { purgeExpiredRecycleBinEntries } from '../services/fileService';
import { logger } from '../utils/logger';

/**
 * Simple interval-based cleanup job (spec section 28/29).
 *
 * For this academic project, an in-process setInterval is enough to
 * demonstrate the retention-policy behaviour without adding Redis/
 * BullMQ as a hard dependency just to run one recurring task. If the
 * system needs to scale to multiple backend instances, swap this for
 * a BullMQ repeatable job backed by Redis so only one worker executes
 * the sweep.
 */
export function startRecycleBinCleanupJob(intervalMs = 60 * 60 * 1000) {
  const run = async () => {
    try {
      const purged = await purgeExpiredRecycleBinEntries();
      if (purged > 0) {
        logger.info(`Recycle bin cleanup: permanently purged ${purged} expired file(s)`);
      }
    } catch (err) {
      logger.error('Recycle bin cleanup job failed', { error: (err as Error).message });
    }
  };

  run();
  setInterval(run, intervalMs);
}
