import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

import si from 'systeminformation';
import fetch from 'node-fetch';
import ping from 'ping';
import fs from 'fs-extra';

// ===================== CONFIG =====================
const TARGET_GUILD = "713204437463728128";
const TARGET_CHANNEL = "1442851690691694644";
const PING_FILE = "./ping.json";

let currentPage = "hardware";
let isEditing = false;
let mainMessage; // mensagem principal do painel

let CACHE_PUBLIC_IP;
let CACHE_PROVIDER;

// ===================== JSON HELPERS =====================
const getHosts = () => fs.readJsonSync(PING_FILE);
const saveHosts = (data) => fs.writeJsonSync(PING_FILE, data, { spaces: 2 });

// ===================== REDE =====================
async function getPublicIP() {
  if (CACHE_PUBLIC_IP) {
    return CACHE_PUBLIC_IP;
  }
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    CACHE_PUBLIC_IP = (await r.json()).ip;
    return CACHE_PUBLIC_IP;
  } catch {
    return null;
  }
}

async function getProviderInfo(ip) {
  if (CACHE_PROVIDER) {
    return CACHE_PROVIDER;
  }
  try {
      const r = await fetch("https://vpnapi.io/api/" + ip + "?key=" + process.env.TOKEN_VPNAPI
    );
    CACHE_PROVIDER = await r.json();
    return CACHE_PROVIDER;
  } catch {
    return null;
  }
}

// ===================== EMBED DE HARDWARE =====================
async function buildHardwareEmbed() {
  const cpu = await si.cpu();
  const load = await si.currentLoad();
  const mem = await si.mem();
  const os = await si.osInfo();

  const ip = await getPublicIP();
  const prov = ip ? await getProviderInfo(ip) : null;

  const embed = new EmbedBuilder()
    .setTitle("🖥️ Hardware do Servidor")
    .setColor("#00AAFF")
    .setTimestamp()
    .addFields(
      {
        name: "CPU",
        value: `
**Modelo:** ${cpu.manufacturer} ${cpu.brand}
**Cores:** ${cpu.physicalCores}
**Threads:** ${cpu.cores}
**Uso:** ${load.currentLoad.toFixed(2)}%`
      },
      {
        name: "Memória",
        value: `
**Total:** ${(mem.total / 1e9).toFixed(2)} GB
**Usada:** ${(mem.active / 1e9).toFixed(2)} GB
**Livre:** ${(mem.available / 1e9).toFixed(2)} GB`
      },
      {
        name: "Sistema",
        value: `
**SO:** ${os.distro}
**Kernel:** ${os.kernel}`
      }
    );

  if (prov) {
    embed.addFields({
      name: "Provedor",
      value: `
**IP:** ${prov.ip}
**Cidade:** ${prov.location.city}
**Operadora:** ${prov.network.autonomous_system_organization}
**ASN:** ${prov.network.autonomous_system_number}`
    });
  }

  return embed;
}

// ===================== EMBED DE PING =====================
async function buildPingEmbed() {
  const hosts = getHosts();
  const lines = [];

  for (const h of hosts) {
    const r = await ping.promise.probe(h.host);
    let stats;
    
    if (r.time < 50) {
      stats = `🟢`;
    } else if (r.time < 100) {
      stats = `🟡`;
    } else {
      stats = `🔴`;
    }

    if (!r.alive) {
      stats = `❌`;
      r.time = "N/A";
    }

    lines.push(`**${stats} ${h.name}:**: ${r.time} ms`);
  }

  return new EmbedBuilder()
    .setTitle("🌐 Teste de Latência (Ping)")
    .setDescription(lines.join("\n"))
    .setColor("#00AAFF")
    .setTimestamp();
}

// ===================== BOTÕES =====================
const navButtons = (page) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("page_hardware")
      .setLabel("Hardware")
      .setStyle(page === "hardware" ? ButtonStyle.Primary : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("page_ping")
      .setLabel("Ping")
      .setStyle(page === "ping" ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

const pingButtons = () =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("add_ping")
      .setLabel("➕ Adicionar")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("edit_ping")
      .setLabel("📝 Editar")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("delete_ping")
      .setLabel("❌ Remover")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("refresh_ping")
      .setLabel("🔄 Atualizar")
      .setStyle(ButtonStyle.Secondary)
  );

// ===================== CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===================== READY =====================
client.once(Events.ClientReady, async () => {
  console.log(`BOT ON: ${client.user.tag}`);

  const guild = client.guilds.cache.get(TARGET_GUILD);
  const channel = guild.channels.cache.get(TARGET_CHANNEL);

  // LIMPAR CANAL
  let msgs;
  do {
    msgs = await channel.messages.fetch({ limit: 100 });
    await channel.bulkDelete(msgs);
  } while (msgs.size > 0);

  // PAINEL INICIAL
  const embed = await buildHardwareEmbed();
  mainMessage = await channel.send({
    embeds: [embed],
    components: [navButtons("hardware")]
  });

  // AUTO-UPDATE DO HARDWARE
  setInterval(async () => {
    if (currentPage !== "hardware") return;
    if (isEditing) return;

    try {
      const updated = await buildHardwareEmbed();
      await mainMessage.edit({
        embeds: [updated],
        components: [navButtons("hardware")]
      });
    } catch {}
  }, 4000);

  // ===================== INTERAÇÕES =====================
  client.on("interactionCreate", async (i) => {

    // ===================== NAVEGAÇÃO =====================
    if (i.isButton()) {

      // ---------- HARDWARE ----------
      if (i.customId === "page_hardware") {
        currentPage = "hardware";
        await i.deferUpdate();

        const emb = await buildHardwareEmbed();
        return mainMessage.edit({
          embeds: [emb],
          components: [navButtons("hardware")]
        });
      }

      // ---------- PING ----------
      if (i.customId === "page_ping") {
        currentPage = "ping";
        await i.deferUpdate();

        const emb = await buildPingEmbed();
        return mainMessage.edit({
          embeds: [emb],
          components: [navButtons("ping"), pingButtons()]
        });
      }

      // ===================== ADICIONAR (SEM deferUpdate) =====================
      if (i.customId === "add_ping") {
        isEditing = true;

        const modal = new ModalBuilder()
          .setCustomId("modal_add_ping")
          .setTitle("Adicionar Servidor");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("add_name")
              .setLabel("Nome")
              .setRequired(true)
              .setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("add_host")
              .setLabel("Host")
              .setRequired(true)
              .setStyle(TextInputStyle.Short)
          )
        );

        return i.showModal(modal); // IMPORTANTÍSSIMO
      }

      // ===================== EDITAR (SEM deferUpdate) =====================
      if (i.customId === "edit_ping") {
        const hosts = getHosts();

        const select = new StringSelectMenuBuilder()
          .setCustomId("select_edit_ping")
          .setPlaceholder("Escolha o servidor para editar")
          .addOptions(
            hosts.map(h => ({
              label: h.name,
              description: h.host,
              value: h.host
            }))
          );

        return i.reply({
          content: "Escolha o servidor para editar:",
          components: [new ActionRowBuilder().addComponents(select)],
          ephemeral: true
        });
      }

      // ===================== REMOVER (SEM deferUpdate) =====================
      if (i.customId === "delete_ping") {
        const hosts = getHosts();

        const select = new StringSelectMenuBuilder()
          .setCustomId("select_delete_ping")
          .setPlaceholder("Escolha o servidor para remover")
          .addOptions(
            hosts.map(h => ({
              label: h.name,
              description: h.host,
              value: h.host
            }))
          );

        return i.reply({
          content: "Escolha o servidor para remover:",
          components: [new ActionRowBuilder().addComponents(select)],
          ephemeral: true
        });
      }

      // ===================== REFRESH =====================
      if (i.customId === "refresh_ping") {
        await i.deferUpdate();
        const emb = await buildPingEmbed();

        return mainMessage.edit({
          embeds: [emb],
          components: [navButtons("ping"), pingButtons()]
        });
      }
    }

    // ===================== SELECT → EDITAR =====================
    if (i.customId === "select_edit_ping") {
      const hostSel = i.values[0];
      const item = getHosts().find(h => h.host === hostSel);

      isEditing = true;

      const modal = new ModalBuilder()
        .setCustomId(`modal_edit_ping_${hostSel}`)
        .setTitle("Editar Servidor");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("edit_name")
            .setLabel("Nome")
            .setValue(item.name)
            .setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("edit_host")
            .setLabel("Host")
            .setValue(item.host)
            .setStyle(TextInputStyle.Short)
        )
      );

      return i.showModal(modal);
    }

    // ===================== SELECT → REMOVER =====================
    if (i.customId === "select_delete_ping") {
      const hostSel = i.values[0];

      let list = getHosts();
      list = list.filter(h => h.host !== hostSel);
      saveHosts(list);

      await i.deferUpdate();

      const emb = await buildPingEmbed();
      return mainMessage.edit({
        embeds: [emb],
        components: [navButtons("ping"), pingButtons()]
      });
    }

    // ===================== MODAL → ADICIONAR =====================
    if (i.customId === "modal_add_ping") {
      const name = i.fields.getTextInputValue("add_name");
      const host = i.fields.getTextInputValue("add_host");

      let list = getHosts();
      list.push({ name, host });
      saveHosts(list);

      const emb = await buildPingEmbed();

      isEditing = false;
      await i.deferUpdate();

      return mainMessage.edit({
        embeds: [emb],
        components: [navButtons("ping"), pingButtons()]
      });
    }

    // ===================== MODAL → EDITAR =====================
    if (i.customId.startsWith("modal_edit_ping_")) {
      const oldHost = i.customId.replace("modal_edit_ping_", "");

      const newName = i.fields.getTextInputValue("edit_name");
      const newHost = i.fields.getTextInputValue("edit_host");

      let list = getHosts();
      const item = list.find(h => h.host === oldHost);

      if (item) {
        item.name = newName;
        item.host = newHost;
      }
      saveHosts(list);

      const emb = await buildPingEmbed();

      isEditing = false;
      await i.deferUpdate();

      return mainMessage.edit({
        embeds: [emb],
        components: [navButtons("ping"), pingButtons()]
      });
    }
  });
});

client.login(process.env.TOKEN);