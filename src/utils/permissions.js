const { PermissionFlagsBits } = require('discord.js');

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.ManageChannels) || member.permissions.has(PermissionFlagsBits.Administrator);
}

function isTempOwner(db, channelId, userId) {
  const temp = db.getTemp(channelId);
  return temp && temp.ownerId === userId;
}

function canManageTemp(member, channelId, db) {
  if (isAdmin(member)) return true;
  return isTempOwner(db, channelId, member.id);
}

// Check if member is inside a temp voice they own or admin can still manage
function getManagedChannel(member, db) {
  const vc = member.voice.channel;
  if (!vc) return null;
  if (!db.isTemp(vc.id)) return null;
  return vc;
}

function getOwnerManagedChannel(member, db) {
  const vc = getManagedChannel(member, db);
  if (!vc) return null;
  const temp = db.getTemp(vc.id);
  if (temp.ownerId !== member.id && !isAdmin(member)) return null;
  return vc;
}

module.exports = { isAdmin, isTempOwner, canManageTemp, getManagedChannel, getOwnerManagedChannel };
