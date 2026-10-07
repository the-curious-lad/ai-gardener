'use strict';

const dns = require('dns');
const mongoose = require('mongoose');
const config = require('./env');

// Ensure reliable SRV/TXT and IPv4 A-record resolution for mongodb+srv:// URIs on Windows networks
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  const origLookup = dns.lookup.bind(dns);
  dns.lookup = function customLookup(hostname, options, callback) {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'object' && options !== null ? options : {};
    if (typeof hostname === 'string' && hostname.endsWith('.mongodb.net')) {
      dns.resolve4(hostname, (err, addresses) => {
        if (!err && addresses && addresses.length > 0) {
          if (opts.all) {
            return cb(null, addresses.map((addr) => ({ address: addr, family: 4 })));
          }
          return cb(null, addresses[0], 4);
        }
        return origLookup(hostname, options, callback);
      });
      return;
    }
    return origLookup(hostname, options, callback);
  };
} catch (_) {
  // ignore if restricted
}

let appDb = null;
let knowledgeDb = null;

/**
 * Connect to MongoDB Atlas (with automatic retry and local MongoDB fallback if offline).
 * Returns { appDb, knowledgeDb } connection handles.
 */
async function connectDB() {
  if (appDb && knowledgeDb) return { appDb, knowledgeDb };

  const primaryUri = config.mongodb.uri;
  const fallbackLocalUri = 'mongodb://127.0.0.1:27017/';

  try {
    await mongoose.connect(primaryUri, {
      dbName: config.mongodb.appDb,
      serverSelectionTimeoutMS: 4000,
      family: 4,
    });
    console.log(`[DB] Connected to Primary MongoDB → ${config.mongodb.appDb} | ${config.mongodb.knowledgeDb}`);
  } catch (err) {
    console.warn(`[DB] Primary MongoDB connection attempt 1 failed (${err.message}). Retrying...`);
    try {
      await mongoose.connect(primaryUri, {
        dbName: config.mongodb.appDb,
        serverSelectionTimeoutMS: 4000,
        family: 4,
      });
      console.log(`[DB] Connected to Primary MongoDB (retry) → ${config.mongodb.appDb} | ${config.mongodb.knowledgeDb}`);
    } catch (err2) {
      if (primaryUri !== fallbackLocalUri) {
        console.warn(`[DB] Atlas unreachable on current network (${err2.message}) — falling back to local MongoDB (${fallbackLocalUri})`);
        await mongoose.connect(fallbackLocalUri, {
          dbName: config.mongodb.appDb,
          serverSelectionTimeoutMS: 5000,
        });
        console.log(`[DB] Connected to Local MongoDB → ${config.mongodb.appDb} | ${config.mongodb.knowledgeDb}`);
      } else {
        throw err2;
      }
    }
  }

  appDb = mongoose.connection.useDb(config.mongodb.appDb, { useCache: true });
  knowledgeDb = mongoose.connection.useDb(config.mongodb.knowledgeDb, { useCache: true });

  return { appDb, knowledgeDb };
}

function getAppDb() {
  if (!appDb) throw new Error('DB not initialised. Call connectDB() first.');
  return appDb;
}

function getKnowledgeDb() {
  if (!knowledgeDb) throw new Error('DB not initialised. Call connectDB() first.');
  return knowledgeDb;
}

module.exports = { connectDB, getAppDb, getKnowledgeDb };
