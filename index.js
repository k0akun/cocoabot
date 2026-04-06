import "dotenv/config";
import express from "express";
import { Client, GatewayIntentBits, Events, REST, Routes, Collection } from "discord.js";
import { initDb, Sessions, BlockLogs, MessageQueue } from "./db.js";
import * as playtimeCmd from "./commands/playtime.js";
import * as blocklogCmd from "./commands/blocklog.js";

const {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID,
  DISCORD_CHAT_CHANNEL_ID,
  PORT = "3000",
} = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error("❌ .env に DISCORD_TOKEN と DISCORD_CLIENT_ID を設定してください");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commands = new Collection();
commands.set(playtimeCmd.data.name, playtimeCmd);
commands.set(blocklogCmd.data.name, blocklogCmd);

async function deployCommands() {
  const rest = new REST().setToken(DISCORD_TOKEN);
  const body = [playtimeCmd.data.toJSON(), blocklogCmd.data.toJSON()];
  const route = DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
    : Routes.applicationCommands(DISCORD_CLIENT_ID);
  await rest.put(route, { body });
  console.log("✅ スラッシュコマンドをデプロイしました");
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Discord Bot 起動: ${client.user.tag}`);
  await deployCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (e) {
    console.error("コマンドエラー:", e);
    const msg = { content: "❌ エラーが発生しました", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!DISCORD_CHAT_CHANNEL_ID) return;
  if (message.channelId !== DISCORD_CHAT_CHANNEL_ID) return;
  if (message.content.startsWith("/")) return;
  await MessageQueue.push(message.author.displayName, message.content);
});

// ========================================
// Express
// ========================================
const app = express();
app.use(express.json());

app.post("/api/player-join", async (req, res) => {
  const { name, timestamp } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  await Sessions.join(name, timestamp ?? Date.now());
  res.json({ ok: true });
});

app.post("/api/player-leave", async (req, res) => {
  const { name, timestamp } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  await Sessions.leave(name, timestamp ?? Date.now());
  res.json({ ok: true });
});

app.post("/api/blocklog", async (req, res) => {
  const data = req.body;
  if (!data.type || data.x == null || data.y == null || data.z == null) {
    return res.status(400).json({ error: "type, x, y, z required" });
  }
  await BlockLogs.insert(data);
  res.json({ ok: true });
});

app.get("/api/pending-messages", async (req, res) => {
  const messages = await MessageQueue.flush();
  res.json(messages.map((m) => ({ author: m.author, content: m.content })));
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// ========================================
// 起動
// ========================================
app.listen(PORT, async () => {
  console.log(`✅ HTTPサーバー起動: ポート ${PORT}`);
  await initDb();
  console.log("✅ データベース初期化完了");
client.login(DISCORD_TOKEN).catch(e => console.error("❌ Botログイン失敗:", e));
});
