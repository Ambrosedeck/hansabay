/**
 * Storage abstraction for uploaded video files.
 *
 * Every driver implements the same interface:
 *
 *   name                                  -> string identifier saved on each item ('local', 's3', ...)
 *   async save(tempFilePath, { originalName, mimeType }) -> { key, size }
 *   async delete(key)
 *   async serve(key, req, res)            -> streams (with Range support) or redirects to the file
 *
 * To add a new backend, create a file in this folder that exports an object
 * with those methods, then register it in the `drivers` map below and set
 * STORAGE_DRIVER in .env. Existing items remember which driver stored them,
 * so switching drivers does not break previously uploaded videos as long as
 * the old driver remains configured.
 */
const config = require('../config');

const drivers = {
  local: () => require('./local'),
  s3: () => require('./s3'),
};

const cache = {};

function getDriver(name = config.storage.driver) {
  const key = String(name || 'local').toLowerCase();
  if (!drivers[key]) {
    throw new Error(`Unknown storage driver "${key}". Available: ${Object.keys(drivers).join(', ')}`);
  }
  if (!cache[key]) cache[key] = drivers[key]();
  return cache[key];
}

module.exports = {
  getDriver,
  /** The driver used for NEW uploads. */
  get active() {
    return getDriver(config.storage.driver);
  },
};
