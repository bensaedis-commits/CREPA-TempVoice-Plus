// Simple JSON Database - نسخة Plus الكاملة بدون native dependencies
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'database.json');

const DEFAULT_DATA = {
  guilds: {},       // guildId -> settings
  tempChannels: {}, // channelId -> { guildId, ownerId, jtcId, createdAt, locked, hidden, soundboardDisabled, lastCallAdminAt }
  savedConfigs: {}, // guildId -> userId -> { name, limit, locked, hidden, soundboardDisabled, savedAt }
};

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    save(DEFAULT_DATA);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const data = JSON.parse(raw);
    // migration defaults
    if (!data.guilds) data.guilds = {};
    if (!data.tempChannels) data.tempChannels = {};
    if (!data.savedConfigs) data.savedConfigs = {};
    // migrate old guilds
    for (const gid of Object.keys(data.guilds)) {
      if (data.guilds[gid].staffRoleId === undefined) data.guilds[gid].staffRoleId = "1548676119249821816";
      if (data.guilds[gid].bannerUrl === undefined) data.guilds[gid].bannerUrl = null;
      if (!data.guilds[gid].jtcCategories) {
        data.guilds[gid].jtcCategories = {
          "1549444850800140379": "1549444775785140254",
          "1548720642143162489": "1547674387283714070"
        };
        if (data.guilds[gid].categoryId) {
          for (const jtc of (data.guilds[gid].jtcChannels || [])) {
            if (!data.guilds[gid].jtcCategories[jtc]) data.guilds[gid].jtcCategories[jtc] = data.guilds[gid].categoryId;
          }
        }
      }
      if (!Array.isArray(data.guilds[gid].jtcChannels) || data.guilds[gid].jtcChannels.length === 0) {
        data.guilds[gid].jtcChannels = ["1549444850800140379", "1548720642143162489"];
      }
    }
    for (const cid of Object.keys(data.tempChannels)) {
      if (data.tempChannels[cid].soundboardDisabled === undefined) data.tempChannels[cid].soundboardDisabled = false;
      if (data.tempChannels[cid].lastCallAdminAt === undefined) data.tempChannels[cid].lastCallAdminAt = 0;
      if (data.tempChannels[cid].panelMessageId === undefined) data.tempChannels[cid].panelMessageId = null;
      if (data.tempChannels[cid].panelChannelId === undefined) data.tempChannels[cid].panelChannelId = null;
    }
    return data;
  } catch (e) {
    console.error('[DB] load failed, resetting', e.message);
    save(DEFAULT_DATA);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function save(data) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

class Database {
  constructor() {
    this.data = load();
    this._writeQueued = false;
  }

  _persist() {
    if (this._writeQueued) return;
    this._writeQueued = true;
    setImmediate(() => {
      this._writeQueued = false;
      save(this.data);
    });
  }

  // ---------- Guild Settings ----------
  getGuild(guildId) {
    if (!this.data.guilds[guildId]) {
      const cfg = require('./config');
      this.data.guilds[guildId] = {
        // Pre-configured CREPA voices - work out of the box
        jtcChannels: ["1549444850800140379", "1548720642143162489"],
        jtcCategories: {
          "1549444850800140379": "1549444775785140254",
          "1548720642143162489": "1547674387283714070"
        },
        categoryId: cfg.defaultSettings.categoryId,
        channelName: cfg.defaultSettings.channelName,
        channelNameLocked: cfg.defaultSettings.channelNameLocked,
        channelNameHidden: cfg.defaultSettings.channelNameHidden,
        userLimit: cfg.defaultSettings.userLimit,
        bitrate: cfg.defaultSettings.bitrate,
        controlChannelId: cfg.defaultSettings.controlChannelId,
        logChannelId: cfg.defaultSettings.logChannelId,
        interfaceEnabled: cfg.defaultSettings.interfaceEnabled,
        staffRoleId: "1548676119249821816",
        bannerUrl: null,
        customEmojis: cfg.customEmojis || {},
      };
      this._persist();
    }
    // ensure fields & migrate old guilds
    const g = this.data.guilds[guildId];
    if (!Array.isArray(g.jtcChannels)) g.jtcChannels = [];
    // Migrate: if empty, set CREPA defaults
    if (g.jtcChannels.length === 0) {
      g.jtcChannels = ["1549444850800140379", "1548720642143162489"];
      if (!g.jtcCategories) g.jtcCategories = {
        "1549444850800140379": "1549444775785140254",
        "1548720642143162489": "1547674387283714070"
      };
      this._persist();
    }
    if (!g.jtcCategories) {
      g.jtcCategories = {
        "1549444850800140379": "1549444775785140254",
        "1548720642143162489": "1547674387283714070"
      };
      // Preserve old generic categoryId for any JTC without specific mapping
      if (g.categoryId) {
        for (const jtc of g.jtcChannels) {
          if (!g.jtcCategories[jtc]) g.jtcCategories[jtc] = g.categoryId;
        }
      }
      this._persist();
    }
    // Ensure both CREPA voices are present
    const CREPA_JTCS = ["1549444850800140379", "1548720642143162489"];
    const CREPA_CATS = { "1549444850800140379": "1549444775785140254", "1548720642143162489": "1547674387283714070" };
    let changed = false;
    for (const id of CREPA_JTCS) {
      if (!g.jtcChannels.includes(id)) { g.jtcChannels.push(id); changed = true; }
      if (!g.jtcCategories[id]) { g.jtcCategories[id] = CREPA_CATS[id]; changed = true; }
    }
    if (changed) this._persist();
    if (g.categoryId === undefined) g.categoryId = null;
    if (!g.channelName) g.channelName = require('./config').defaultSettings.channelName;
    if (!g.staffRoleId) g.staffRoleId = "1548676119249821816";
    if (g.bannerUrl === undefined) g.bannerUrl = null;
    if (!g.customEmojis) g.customEmojis = {};
    return g;
  }

  getCategoryForJTC(guildId, jtcId) {
    const g = this.getGuild(guildId);
    return g.jtcCategories?.[jtcId] || g.categoryId || null;
  }

  setGuild(guildId, patch) {
    const g = this.getGuild(guildId);
    Object.assign(g, patch);
    this._persist();
    return g;
  }

  addJTC(guildId, channelId, categoryId = null) {
    const g = this.getGuild(guildId);
    if (!g.jtcChannels.includes(channelId)) {
      g.jtcChannels.push(channelId);
    }
    if (categoryId) {
      if (!g.jtcCategories) g.jtcCategories = {};
      g.jtcCategories[channelId] = categoryId;
    } else if (!g.jtcCategories?.[channelId]) {
      // Default to global category or JTC's own parent (handled in voiceManager)
      if (g.categoryId) g.jtcCategories[channelId] = g.categoryId;
    }
    this._persist();
  }

  removeJTC(guildId, channelId) {
    const g = this.getGuild(guildId);
    g.jtcChannels = g.jtcChannels.filter(id => id !== channelId);
    if (g.jtcCategories?.[channelId]) {
      delete g.jtcCategories[channelId];
    }
    this._persist();
  }

  setJTCategory(guildId, jtcId, categoryId) {
    const g = this.getGuild(guildId);
    if (!g.jtcCategories) g.jtcCategories = {};
    g.jtcCategories[jtcId] = categoryId;
    this._persist();
  }

  isJTC(guildId, channelId) {
    const g = this.data.guilds[guildId];
    if (!g) return false;
    return g.jtcChannels.includes(channelId);
  }

  // ---------- Temp Channels ----------
  createTemp(channelId, guildId, ownerId, jtcId) {
    this.data.tempChannels[channelId] = {
      guildId,
      ownerId,
      jtcId,
      createdAt: Date.now(),
      locked: false,
      hidden: false,
      soundboardDisabled: false,
      lastCallAdminAt: 0,
      panelMessageId: null,
      panelChannelId: null,
    };
    // apply saved config if exists
    const saved = this.getSavedConfig(guildId, ownerId);
    if (saved) {
      this.data.tempChannels[channelId].locked = !!saved.locked;
      this.data.tempChannels[channelId].hidden = !!saved.hidden;
      this.data.tempChannels[channelId].soundboardDisabled = !!saved.soundboardDisabled;
      if (saved.limit !== undefined) this.data.tempChannels[channelId].savedLimit = saved.limit;
      if (saved.name) this.data.tempChannels[channelId].savedName = saved.name;
    }
    this._persist();
  }

  getTemp(channelId) {
    return this.data.tempChannels[channelId] || null;
  }

  isTemp(channelId) {
    return !!this.data.tempChannels[channelId];
  }

  updateTemp(channelId, patch) {
    if (this.data.tempChannels[channelId]) {
      Object.assign(this.data.tempChannels[channelId], patch);
      this._persist();
    }
  }

  setOwner(channelId, newOwnerId) {
    this.updateTemp(channelId, { ownerId: newOwnerId });
  }

  setPanel(channelId, messageId, channelId2) {
    this.updateTemp(channelId, { panelMessageId: messageId, panelChannelId: channelId2 });
  }

  deleteTemp(channelId) {
    if (this.data.tempChannels[channelId]) {
      delete this.data.tempChannels[channelId];
      this._persist();
    }
  }

  getTempsByGuild(guildId) {
    return Object.entries(this.data.tempChannels)
      .filter(([, v]) => v.guildId === guildId)
      .map(([k, v]) => ({ channelId: k, ...v }));
  }

  getTempsByOwner(guildId, ownerId) {
    return this.getTempsByGuild(guildId).filter(t => t.ownerId === ownerId);
  }

  // ---------- Saved Configs (Save/Reset) ----------
  getSavedConfig(guildId, userId) {
    if (!this.data.savedConfigs[guildId]) return null;
    return this.data.savedConfigs[guildId][userId] || null;
  }
  setSavedConfig(guildId, userId, cfg) {
    if (!this.data.savedConfigs[guildId]) this.data.savedConfigs[guildId] = {};
    this.data.savedConfigs[guildId][userId] = { ...cfg, savedAt: Date.now() };
    this._persist();
  }
  clearSavedConfig(guildId, userId) {
    if (this.data.savedConfigs[guildId]?.[userId]) {
      delete this.data.savedConfigs[guildId][userId];
      this._persist();
      return true;
    }
    return false;
  }
  hasSavedConfig(guildId, userId) {
    return !!this.getSavedConfig(guildId, userId);
  }

  // force save (for shutdown)
  flush() { save(this.data); }
}

module.exports = new Database();
