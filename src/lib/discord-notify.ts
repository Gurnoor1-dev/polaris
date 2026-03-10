const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1476573367497789662/_PjS3ntT7dS1g07IClvul_jxxcWe4VMwmWXQ8IN1XGtkLTKXVseKkIr-MkeoIdE5CztV";

export const formatPirepTime = (decimalHours: number) => {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  if (h > 0 && m > 0) return `${h}hrs ${m}mins`;
  if (h > 0) return `${h}hrs`;
  return `${m}mins`;
};

export const sendDiscordEmbed = async (embed: any) => {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          ...embed,
          footer: {
            text: `Powered by VACompany`
          },
          timestamp: new Date().toISOString()
        }]
      }),
    });
  } catch (err) {
    console.error("Discord Notification Error:", err);
  }
};

