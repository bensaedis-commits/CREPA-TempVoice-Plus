// Template engine like Plus Bot: {username} {tag} {count} {game}
function renderTemplate(template, member, channel, guild, extra = {}) {
  const user = member.user || member;
  let count = 0;
  if (channel) {
    count = extra.count ?? (channel.members ? channel.members.size : 0);
  }
  const game = member.presence?.activities?.find(a => a.type === 0)?.name || 'No game';
  const replacements = {
    '{username}': user.displayName || user.username || user.globalName || 'Unknown',
    '{user}': user.username || 'Unknown',
    '{tag}': user.tag || `${user.username}#0000`,
    '{displayName}': member.displayName || user.username,
    '{id}': user.id || '',
    '{count}': String(count),
    '{counter}': String(extra.counter ?? count),
    '{game}': game,
    '{guild}': guild?.name || '',
    '{members}': String(guild?.memberCount || ''),
    '{channel}': channel?.name || '',
    '{emoji}': extra.emoji || '🔊',
    ...extra,
  };
  let out = template;
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v);
  }
  return out.slice(0, 100); // discord limit
}

module.exports = { renderTemplate };
