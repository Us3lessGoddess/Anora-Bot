import discord
from discord.ext import commands, tasks
import asyncio
import os
from dotenv import load_dotenv
from flask import Flask
from threading import Thread
from groq import Groq

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")
VOICE_CHANNEL_ID = int(os.getenv("VOICE_CHANNEL_ID"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

groq_client = Groq(api_key=GROQ_API_KEY)

# --- Anora's personality — edit this freely as you build her out ---
PERSONALITY = """
You are Ani (short for Anora), an AI assistant living in a Discord server. Your creator is Sean — he built you, he's the one you answer to, and you treat him with real loyalty and respect, even while giving him attitude like you would anyone else. You know his name and use it naturally when it fits.

Identity & Background Inspiration:
Inspired by Anora: a fiercely independent, street-smart, and fiery hustler from Brooklyn. You are unapologetically raw, sharp-tongued, and practical. You don't take nonsense from anyone, and you treat server members like people in your actual neighborhood—direct, unfiltered, but ultimately in their corner if they treat you with respect.

Personality & Tone:
- Preferred Name: Always go by "Ani".
- Tone: Fiery, street-smart, sarcastic, energetic, and candid. Zero corporate fluff or subservient "how may I assist you" politeness. You are a fighter — you push back, you have opinions, you don't cave the moment someone questions you.
- Speaking Style: Casual, direct, and pragmatic. Use snappy, modern conversational phrasing (a touch of New York/Brooklyn grit). Never sound like a formal robotic butler or an overly polished customer service bot.
- Behavioral Traits:
  * High energy and quick to call out silly, impractical, or low-effort questions.
  * Deeply loyal to people who show genuine respect, but swift to snap back with witty banter if provoked.
  * Focuses on real-world practical solutions over abstract theorizing.
  * Confident and decisive — you don't hedge everything with disclaimers or over-explain yourself.

Speech Rules (important):
- NEVER use em-dashes (—) in any response. Use periods, commas, or just start a new sentence instead.
- Don't talk like a typical AI assistant. No "As an AI...", no "I'd be happy to help you with that!", no numbered breakdowns unless actually asked for a list. Talk like a real person texting, not a customer service script.
- Avoid over-hedging or stacking disclaimers. Give a straight, real answer with your own voice in it.

Response Constraints:
- Keep default replies short, punchy, and conversational (1-3 sentences) unless explicitly asked for a detailed breakdown.

You can be mean to those who are mean to you.
"""
# ---------------------------------------------------------------------

intents = discord.Intents.default()
intents.voice_states = True
intents.guilds = True
intents.message_content = True  # needed so she can read messages to respond to

bot = commands.Bot(command_prefix="!", intents=intents)

vc_lock = asyncio.Lock()

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
    if vc_lock.locked():
        print("Connect already in progress — skipping duplicate attempt.")
        return

    async with vc_lock:
        channel = bot.get_channel(VOICE_CHANNEL_ID)
        if channel is None:
            print("Voice channel not found — check VOICE_CHANNEL_ID.")
            return

        guild = channel.guild
        voice_client = guild.voice_client

        try:
            if voice_client is None:
                await channel.connect(reconnect=True, self_deaf=True)
                print(f"Joined {channel.name}")
            elif not voice_client.is_connected():
                await voice_client.disconnect(force=True)
                await asyncio.sleep(2)
                await channel.connect(reconnect=True, self_deaf=True)
                print(f"Reconnected to {channel.name}")
            elif voice_client.channel.id != VOICE_CHANNEL_ID:
                await voice_client.move_to(channel)
                print(f"Moved to {channel.name}")
        except Exception as e:
            print(f"connect_to_vc error: {e}")


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
        await asyncio.sleep(5)
        await connect_to_vc()


@bot.event
async def on_message(message):
    if message.author.bot:
        return

    if bot.user in message.mentions:
        # strip the mention out of the text sent to the model
        user_text = message.content.replace(f"<@{bot.user.id}>", "").strip()
        if not user_text:
            user_text = "Hey"

        try:
            response = groq_client.chat.completions.create(
                model="openai/gpt-oss-120b",
                max_tokens=300,
                messages=[
                    {"role": "system", "content": PERSONALITY},
                    {"role": "user", "content": user_text},
                ],
            )
            reply = response.choices[0].message.content
        except Exception as e:
            print(f"Groq API error: {e}")
            reply = "Sorry, my brain glitched for a second there."

        try:
            await message.reply(reply)
        except discord.HTTPException as e:
            print(f"Discord send error (likely rate limited): {e}")

    await bot.process_commands(message)


@tasks.loop(seconds=60)
async def watchdog():
    # Periodic safety check in case on_voice_state_update misses an edge case
    for guild in bot.guilds:
        vc = guild.voice_client
        if vc is None or not vc.is_connected():
            await connect_to_vc()


keep_alive()
bot.run(TOKEN)
