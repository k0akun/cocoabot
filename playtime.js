import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { BlockLogs } from "../db.js";

function formatTime(ts) {
  return new Date(Number(ts)).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}
function shortDim(dim) {
  return String(dim).replace("minecraft:", "").replace("overworld","地上").replace("nether","ネザー").replace("the_end","エンド");
}
function typeLabel(type) {
  switch (type) {
    case "place": return "🧱 設置";
    case "break": return "⛏ 破壊";
    case "entity_spawn": return "🐾 スポーン";
    case "entity_die": return "💀 死亡";
    default: return type;
  }
}

export const data = new SlashCommandBuilder()
  .setName("blocklog").setDescription("ブロック・エンティティの操作ログを確認")
  .addSubcommand((sub) => sub.setName("coord").setDescription("指定座標のログ")
    .addIntegerOption((o) => o.setName("x").setDescription("X座標").setRequired(true))
    .addIntegerOption((o) => o.setName("y").setDescription("Y座標").setRequired(true))
    .addIntegerOption((o) => o.setName("z").setDescription("Z座標").setRequired(true))
    .addIntegerOption((o) => o.setName("radius").setDescription("半径").setRequired(false))
  )
  .addSubcommand((sub) => sub.setName("last").setDescription("指定座標の最終操作")
    .addIntegerOption((o) => o.setName("x").setDescription("X座標").setRequired(true))
    .addIntegerOption((o) => o.setName("y").setDescription("Y座標").setRequired(true))
    .addIntegerOption((o) => o.setName("z").setDescription("Z座標").setRequired(true))
  )
  .addSubcommand((sub) => sub.setName("player").setDescription("プレイヤーの操作ログ")
    .addStringOption((o) => o.setName("name").setDescription("プレイヤー名").setRequired(true))
    .addIntegerOption((o) => o.setName("limit").setDescription("件数(最大50)").setRequired(false))
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "coord") {
    const x = interaction.options.getInteger("x");
    const y = interaction.options.getInteger("y");
    const z = interaction.options.getInteger("z");
    const radius = interaction.options.getInteger("radius") ?? 0;
    const logs = await BlockLogs.queryByCoord(x, y, z, radius);
    if (logs.length === 0) { await interaction.reply(`📭 座標 (${x}, ${y}, ${z}) のログはありません。`); return; }
    const lines = logs.slice(0,20).map((r) => `${typeLabel(r.type)} \`${r.block ?? r.entity ?? "不明"}\` by **${r.player ?? "自然"}** at (${r.x},${r.y},${r.z})\n⌚ ${formatTime(r.timestamp)}`);
    const embed = new EmbedBuilder().setColor(0xeb459e).setTitle(`📍 座標 (${x}, ${y}, ${z}) 半径${radius} のログ`).setDescription(lines.join("\n\n")).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  else if (sub === "last") {
    const x = interaction.options.getInteger("x");
    const y = interaction.options.getInteger("y");
    const z = interaction.options.getInteger("z");
    const log = await BlockLogs.getLastAction(x, y, z);
    if (!log) { await interaction.reply(`📭 座標 (${x}, ${y}, ${z}) のログはありません。`); return; }
    const embed = new EmbedBuilder().setColor(0xed4245).setTitle(`🔍 (${x}, ${y}, ${z}) の最終操作`)
      .addFields(
        { name: "操作", value: typeLabel(log.type), inline: true },
        { name: "対象", value: `\`${log.block ?? log.entity ?? "不明"}\``, inline: true },
        { name: "プレイヤー", value: String(log.player ?? "自然"), inline: true },
        { name: "日時", value: formatTime(log.timestamp) }
      ).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  else if (sub === "player") {
    const name = interaction.options.getString("name");
    const limit = Math.min(interaction.options.getInteger("limit") ?? 20, 50);
    const logs = await BlockLogs.queryByPlayer(name, limit);
    if (logs.length === 0) { await interaction.reply(`📭 **${name}** のログはありません。`); return; }
    const lines = logs.map((r) => `${typeLabel(r.type)} \`${r.block ?? r.entity ?? "不明"}\` at (${r.x},${r.y},${r.z}) [${shortDim(r.dimension)}] — ${formatTime(r.timestamp)}`);
    const embed = new EmbedBuilder().setColor(0x57f287).setTitle(`📋 ${name} の操作ログ (${logs.length}件)`).setDescription(lines.join("\n")).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
}
