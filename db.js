import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Sessions } from "../db.js";

function formatDuration(ms) {
  if (ms <= 0) return "0分";
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours === 0) return `${mins}分`;
  return `${hours}時間${mins}分`;
}

export const data = new SlashCommandBuilder()
  .setName("playtime")
  .setDescription("マイクラサーバーの在線時間を確認")
  .addSubcommand((sub) =>
    sub.setName("player").setDescription("プレイヤーの累計在線時間")
      .addStringOption((opt) => opt.setName("name").setDescription("プレイヤー名").setRequired(true))
  )
  .addSubcommand((sub) => sub.setName("ranking").setDescription("在線時間ランキング"))
  .addSubcommand((sub) => sub.setName("online").setDescription("現在オンラインのプレイヤー"));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "player") {
    const name = interaction.options.getString("name");
    const totalMs = await Sessions.getTotalPlaytime(name);
    const online = await Sessions.getOnline();
    const isOnline = online.some((p) => p.name === name);
    const embed = new EmbedBuilder()
      .setColor(0x57f287).setTitle(`⏱ ${name} の在線時間`)
      .setDescription(isOnline ? "🟢 現在オンライン" : "⚫ オフライン")
      .addFields({ name: "累計プレイ時間", value: formatDuration(totalMs) }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  else if (sub === "ranking") {
    const ranking = await Sessions.getRanking();
    if (ranking.length === 0) { await interaction.reply("まだデータがありません。"); return; }
    const medals = ["🥇", "🥈", "🥉"];
    const rows = ranking.map((r, i) => `${medals[i] ?? `${i + 1}.`} **${r.name}** — ${formatDuration(Number(r.total_ms))}`);
    const embed = new EmbedBuilder().setColor(0xfee75c).setTitle("🏆 在線時間ランキング").setDescription(rows.join("\n")).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  else if (sub === "online") {
    const online = await Sessions.getOnline();
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`👥 現在のオンライン (${online.length}人)`);
    if (online.length === 0) { embed.setDescription("現在誰もいません"); }
    else {
      const now = Date.now();
      embed.setDescription(online.map((p) => `🟢 **${p.name}** — ${formatDuration(now - Number(p.joined_at))}`).join("\n"));
    }
    await interaction.reply({ embeds: [embed.setTimestamp()] });
  }
}
