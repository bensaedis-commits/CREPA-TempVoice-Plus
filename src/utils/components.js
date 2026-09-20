const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

// Helper to get emoji - supports custom ID or Unicode
// If you uploaded custom emojis in CREPA server, set IDs in config.json -> customEmojis
// Example: { "lock": "123456789012345678", "hide": "123456..." } will be used automatically
function e(db, guildId, key, fallbackUnicode) {
  try {
    const guildCfg = db ? db.getGuild(guildId) : null;
    const custom = guildCfg?.customEmojis?.[key];
    if (custom && /^\d+$/.test(String(custom))) {
      return custom;
    }
    if (custom && custom.includes(':')) return custom;
  } catch {}
  return fallbackUnicode;
}

function getEmojiObjects(db, guildId) {
  // Real IDs from CREPA server - uploaded by user
  const CREPA_IDS = {
    lock: '<:Lock:1551300050309877842>',
    hide: '<:Hide:1551299778455801887>',
    kick: '<:Kick:1551299873372905517>',
    rename: '<:Rename:1551300152034201641>',
    limit: '<:Limite:1551299963579793589>',
    claim: '<:download:1551299686739083364>', // download is actually Claim
    soundboard: '<:SoundboardOff:1551300476337913916>',
    save: '<:Save:1551300270363902033>',
    calladmin: '<:CallStaff:1551299011242364990>',
  };
  function pick(key, fallback) {
    try {
      const custom = db?.getGuild(guildId)?.customEmojis?.[key];
      if (custom) {
        if (/^\d+$/.test(String(custom))) return `<:${key}:${custom}>`;
        if (String(custom).includes(':')) return String(custom);
      }
    } catch {}
    return CREPA_IDS[key] || fallback;
  }
  return {
    lock: pick('lock', CREPA_IDS.lock),
    unlock: pick('lock', CREPA_IDS.lock),
    hide: pick('hide', CREPA_IDS.hide),
    show: pick('hide', CREPA_IDS.hide),
    kick: pick('kick', CREPA_IDS.kick),
    rename: pick('rename', CREPA_IDS.rename),
    limit: pick('limit', CREPA_IDS.limit),
    claim: pick('claim', CREPA_IDS.claim),
    soundboard: pick('soundboard', CREPA_IDS.soundboard),
    save: pick('save', CREPA_IDS.save),
    calladmin: pick('calladmin', CREPA_IDS.calladmin),
  };
}

// 9 buttons only - 2 rows: 5 + 4
function getControlRows(guildId, tempData) {
  const db = require('../database');
  const em = getEmojiObjects(db, guildId);

  const isLocked = tempData?.locked || false;
  const isHidden = tempData?.hidden || false;
  const isSoundboardDisabled = tempData?.soundboardDisabled || false;
  const hasSaved = tempData ? db.hasSavedConfig(guildId, tempData.ownerId) : false;

  // Button 1: Lock/Unlock - transparent (Secondary)
  const lockBtn = new ButtonBuilder()
    .setCustomId('vc_toggle_lock')
    .setEmoji(em.lock)
    .setLabel('Lock')
    .setStyle(ButtonStyle.Secondary);

  // Button 2: Hide/Show - transparent
  const hideBtn = new ButtonBuilder()
    .setCustomId('vc_toggle_hide')
    .setEmoji(em.hide)
    .setLabel('Hide')
    .setStyle(ButtonStyle.Secondary);

  // Button 3: Kick User - transparent
  const kickBtn = new ButtonBuilder()
    .setCustomId('vc_kick')
    .setEmoji(em.kick)
    .setLabel('Kick')
    .setStyle(ButtonStyle.Secondary);

  // Button 4: Rename - transparent
  const renameBtn = new ButtonBuilder()
    .setCustomId('vc_rename')
    .setEmoji(em.rename)
    .setLabel('Rename')
    .setStyle(ButtonStyle.Secondary);

  // Button 5: User Limit - transparent
  const limitBtn = new ButtonBuilder()
    .setCustomId('vc_limit')
    .setEmoji(em.limit)
    .setLabel('Limit')
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(lockBtn, hideBtn, kickBtn, renameBtn, limitBtn);

  // Button 6: Claim - transparent
  const claimBtn = new ButtonBuilder()
    .setCustomId('vc_claim')
    .setEmoji(em.claim)
    .setLabel('Claim')
    .setStyle(ButtonStyle.Secondary);

  // Button 7: Soundboard - transparent
  const sbBtn = new ButtonBuilder()
    .setCustomId('vc_toggle_soundboard')
    .setEmoji(em.soundboard)
    .setLabel('Soundboard')
    .setStyle(ButtonStyle.Secondary);

  // Button 8: Save/Reset - transparent
  const saveBtn = new ButtonBuilder()
    .setCustomId('vc_save_reset')
    .setEmoji(em.save)
    .setLabel('Save')
    .setStyle(ButtonStyle.Secondary);

  // Button 9: Call Admins - transparent
  const callBtn = new ButtonBuilder()
    .setCustomId('vc_call_admins')
    .setEmoji(em.calladmin)
    .setLabel('Call Admin')
    .setStyle(ButtonStyle.Secondary);

  const row2 = new ActionRowBuilder().addComponents(claimBtn, sbBtn, saveBtn, callBtn);

  return [row1, row2];
}

// Kick member selection menu - appears as secondary embed
function getKickSelectMenu(members, guildId) {
  let kickEmoji = '<:Kick:1551299873372905517>';
  try {
    const db = require('../database');
    const em = getEmojiObjects(db, guildId);
    kickEmoji = em.kick;
  } catch {}
  const options = members
    .filter(m => !m.user.bot)
    .first(25) // Discord limit 25
    ?.map(m => ({
      label: m.displayName.slice(0, 100),
      description: `@${m.user.username} - ${m.user.id}`.slice(0,100),
      value: m.id,
      emoji: kickEmoji,
    })) || [];

  if (options.length === 0) return null;

  const select = new StringSelectMenuBuilder()
    .setCustomId('vc_kick_select')
    .setPlaceholder('Select member to kick and block from rejoining')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

// Backward compatibility
function controlRow1() { return getControlRows(null, null)[0]; }
function controlRow2() { return getControlRows(null, null)[1]; }
function controlRow3() { return new ActionRowBuilder(); }

module.exports = {
  getControlRows,
  getKickSelectMenu,
  getEmojiObjects,
  controlRow1, controlRow2, controlRow3,
  MODAL_RENAME: 'modal_rename',
  MODAL_LIMIT: 'modal_limit',
  MODAL_PERMIT: 'modal_permit',
  MODAL_REJECT: 'modal_reject',
  MODAL_KICK: 'modal_kick',
  MODAL_TRANSFER: 'modal_transfer',
  MODAL_BITRATE: 'modal_bitrate',
};
