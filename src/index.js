import 'dotenv/config';
import { Client, Events, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import si from 'systeminformation';
import ping from 'ping';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on(Events.ClientReady, readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}!`);
});

client.on('messageCreate', async msg => {
  if (msg.author.bot) return;

  // --------------------------
  //  COMMAND: ping
  // --------------------------
  if (msg.content === 'ping') {
    msg.reply('Pong!');
  }

  // --------------------------
  //  COMMAND: !status
  // --------------------------
  if (msg.content === '!status') {
    msg.reply('🔍 Coletando informações...');

    // ================
    // PING SERVIDORES
    // ================
    const hosts = [
      { name: "Cloudflare BR", host: "1.1.1.1" },
      { name: "Google BR", host: "8.8.8.8" },
      { name: "NIC.br", host: "nic.br" }
    ];

    const pingResults = [];
    for (const h of hosts) {
      const res = await ping.promise.probe(h.host);
      pingResults.push(`${h.name}: ${res.time} ms`);
    }

    // ================
    // SISTEMA
    // ================
    const cpu = await si.cpu();
    const mem = await si.mem();
    const os = await si.osInfo();
    const load = await si.currentLoad();

    const embed = new EmbedBuilder()
      .setTitle("📊 Status do Servidor da Bot")
      .setColor("#00AAFF")
      .addFields(
        {
          name: "🖥️ CPU",
          value: `
**Modelo:** ${cpu.manufacturer} ${cpu.brand}
**Núcleos físicos:** ${cpu.physicalCores}
**Threads:** ${cpu.cores}
**Uso atual:** ${load.currentLoad.toFixed(2)}%
          `
        },
        {
          name: "💾 Memória",
          value: `
**Total:** ${(mem.total / 1024 / 1024 / 1024).toFixed(2)} GB  
**Usada:** ${(mem.active / 1024 / 1024 / 1024).toFixed(2)} GB  
**Livre:** ${(mem.available / 1024 / 1024 / 1024).toFixed(2)} GB  
          `
        },
        {
          name: "🧩 Sistema Operacional",
          value: `
**SO:** ${os.distro}  
**Versão:** ${os.release}  
**Kernel:** ${os.kernel}  
**Uptime:** ${(os.uptime / 3600).toFixed(1)} horas
          `
        },
        {
          name: "🌐 Ping Brasil",
          value: pingResults.join("\n")
        }
      )
      .setFooter({ text: "Monitoramento do Bot Discord" })
      .setTimestamp();

    msg.channel.send({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);
