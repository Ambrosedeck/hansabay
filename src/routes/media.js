const express = require('express');
const { hasUnlocked } = require('../auth');
const q = require('../queries');
const storage = require('../storage');

const router = express.Router();

// GET /media/:itemId -> stream an uploaded video (only for unlocked packs / admin)
router.get('/:id', async (req, res, next) => {
  try {
    const item = q.getItem(req.params.id);
    if (!item || item.type !== 'video') return res.status(404).json({ error: 'Not found' });

    const packId = q.getItemPackId(item.id);
    if (!hasUnlocked(req, packId)) return res.status(403).json({ error: 'Pack is locked' });

    if (!item.storage_key) {
      // External video – just send the viewer there.
      return res.redirect(302, item.url);
    }
    const driver = storage.getDriver(item.storage_driver || 'local');
    await driver.serve(item.storage_key, req, res, { mimeType: item.mime_type });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
