import discord
from discord.ext import commands, tasks
import asyncio
import os
from dotenv import load_dotenv
from flask import Flask
from threading import Thread

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")
VOICE_CHANNEL_ID = int(os.getenv("VOICE_CHANNEL_ID"))

intents = discord.Intents.default()
intents.voice_states = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

# --- Keep-alive web server (for UptimeRobot) ---
app = Flask('')

@app.route('/')
def home():
    return "Bot is alive"

def run():
    app.run(host='0.0.0.0', port=8080)

def keep_alive():
    t = Thread(target=run)
    t.start()
# ------------------------------------------------


async def connect_to_vc():
    channel = bot.get_channel(VOICE_CHANNEL_ID)
    if channel is None:
        print("Voice channel not found — check VOICE_CHANNEL_ID.")
        return

    guild = channel.guild
    voice_client = guild.voice_client

    if voice_client is None:
        await channel.connect(reconnect=True, self_deaf=True)
        print(f"Joined {channel.name}")
    elif voice_client.channel.id != VOICE_CHANNEL_ID:
        await voice_client.move_to(channel)
        print(f"Moved to {channel.name}")


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")
    await connect_to_vc()
    watchdog.start()


@bot.event
async def on_guild_join(guild):
    print(f"Joined new server: {guild.name}")
    await connect_to_vc()


@bot.event
async def on_voice_state_update(member, before, after):
    # If the bot itself got disconnected (kicked, channel deleted, etc), rejoin
    if member.id == bot.user.id and after.channel is None:
        print("Got disconnected from voice — rejoining...")
        await asyncio.sleep(3)
        await connect_to_vc()


@tasks.loop(seconds=60)
async def watchdog():
    # Periodic safety check in case on_voice_state_update misses an edge case
    for guild in bot.guilds:
        vc = guild.voice_client
        if vc is None or not vc.is_connected():
            await connect_to_vc()


keep_alive()
bot.run(TOKEN)
