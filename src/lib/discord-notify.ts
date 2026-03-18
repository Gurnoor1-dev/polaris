const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1480466485435564125/gjD8v3OY8M6uo1FaxLctar_FBuZgyupz4v4wGnQg4LeaA3L6Xpas6X1c-s7YB0Od_UHK";

/**
 * Formats decimal hours into a readable string like "2hrs 30mins"
 */
export const formatPirepTime = (decimalHours: number) => {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  if (h > 0 && m > 0) return `${h}hrs ${m}mins`;
  if (h > 0) return `${h}hrs`;
  return `${m}mins`;
};

/**
 * Sends a formatted embed to the specified Discord Webhook
 */
export const sendDiscordEmbed = async (embed: any) => {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json" 
      },
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
