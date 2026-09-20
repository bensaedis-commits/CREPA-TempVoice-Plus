const fs = require('fs');
const path = require('path');

let fileConfig = {};
try {
  const configPath = path.join(__dirname, '..', 'config.json');
  if (fs.existsSync(configPath)) fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  else {
    const examplePath = path.join(__dirname, '..', 'config.example.json');
    if (fs.existsSync(examplePath)) fileConfig = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  }
} catch (e) {
  console.warn('[config] failed to load config.json, using defaults', e.message);
}

const defaults = fileConfig.defaultSettings || {};
const emojis = fileConfig.emojis || {};
const colors = fileConfig.colors || {};
const customEmojis = fileConfig.customEmojis || {};

module.exports = {
  defaultSettings: {
    channelName: defaults.channelName || "{username}'s Channel !",
    channelNameLocked: defaults.channelNameLocked || "🔒 {username}'s Channel !",
    channelNameHidden: defaults.channelNameHidden || "🙈 {username}'s Channel !",
    userLimit: defaults.userLimit ?? 0,
    bitrate: defaults.bitrate ?? 64000,
    categoryId: defaults.categoryId ?? null,
    controlChannelId: defaults.controlChannelId ?? null,
    logChannelId: defaults.logChannelId ?? null,
    maxChannelsPerUser: defaults.maxChannelsPerUser ?? 1,
    deleteDelayMs: defaults.deleteDelayMs ?? 0,
    allowRename: defaults.allowRename ?? true,
    allowLimit: defaults.allowLimit ?? true,
    allowLock: defaults.allowLock ?? true,
    allowHide: defaults.allowHide ?? true,
    allowBitrate: defaults.allowBitrate ?? true,
    interfaceEnabled: defaults.interfaceEnabled ?? true,
  },
  emojis: {
    success: emojis.success || '✅',
    error: emojis.error || '❌',
    loading: emojis.loading || '⏳',
    voice: emojis.voice || '🔊',
    lock: emojis.lock || '🔒',
    unlock: emojis.unlock || '🔓',
    hide: emojis.hide || '🙈',
    show: emojis.show || '👁️',
    rename: emojis.rename || '✏️',
    limit: emojis.limit || '👥',
    kick: emojis.kick || '👢',
    permit: emojis.permit || '✅',
    reject: emojis.reject || '🚫',
    transfer: emojis.transfer || '👑',
    claim: emojis.claim || '👑',
    info: emojis.info || 'ℹ️',
    delete: emojis.delete || '🗑️',
    panel: emojis.panel || '🎛️',
    crepa: emojis.crepa || '⚡',
  },
  colors: {
    primary: colors.primary || '#5865F2',
    success: colors.success || '#57F287',
    error: colors.error || '#ED4245',
    warning: colors.warning || '#FEE75C',
    panel: colors.panel || '#2B2D31',
  },
  customEmojis,
  staffRoleId: fileConfig.staffRoleId || "1548676119249821816",
  bannerUrl: fileConfig.bannerUrl || null,
};
