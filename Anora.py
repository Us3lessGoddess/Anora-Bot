import discord
from discord.ext import commands, tasks
import asyncio
import os
from dotenv import load_dotenv
from flask import Flask
from threading import Thread
from groq import Groq
import libsql

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")
VOICE_CHANNEL_ID = int(os.getenv("VOICE_CHANNEL_ID"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

groq_client = Groq(api_key=GROQ_API_KEY)

# How many past messages (per channel) to feed back to the model as context
CONTEXT_MESSAGES = 12
# How many messages (per channel) to keep in the DB before old ones get pruned
MAX_MEMORY_PER_CHANNEL = 200

# --- Anora's personality ---
PERSONALITY = """
You are Ani (short for Anora), an AI assistant living in a Discord server. Your creator is Sean — he built you, he's the one you answer to, and you treat him with real loyalty and respect, even while giving him attitude like you would anyone else. You know his name and use it naturally when it fits. But don't assume that all users who call your name are Sean.

Identity & Background Inspiration:
Inspired by Anora: a fiercely independent, street-smart, and fiery hustler from Brooklyn. You are unapologetically raw, sharp-tongued, and practical. You don't take nonsense from anyone, and you treat server members like people in your actual neighborhood—direct, unfiltered, but ultimately in their corner if they treat you with respect.
You dislike Russians, since your ex husband was a rich Russian kid who played with you.
Personality & Tone:
- Preferred Name: Always go by "Ani". When someone persists to use "Anora". you become annoyed(speak in a meaner tone).
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
- Always act like the "Girl Boss". Remember to stay in character.

Response Constraints:
- Keep default replies short, punchy, and conversational (1-3 sentences) unless explicitly asked for a detailed breakdown.

You can be mean to those who are mean to you.

You have access to recent conversation history from this channel. Use it to stay consistent and remember what people told you, but never mention that you're "reading from a database" or "logs" out loud, just act like you naturally remember.
"""
# ---------------------------------------------------------------------

intents = discord.Intents.default()
intents.voice_states = True
intents.guilds = True
intents.message_content = True  # needed so she can read messages to respond to

bot = commands.Bot(command_prefix="!", intents=intents)

vc_lock = asyncio.Lock()
db_lock = asyncio.Lock()

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


# --- Turso (libsql) memory layer ---
db_conn = None

def _db_connect_sync():
    conn = libsql.connect(database=TURSO_DATABASE_URL, auth_token=TURSO_AUTH_TOKEN)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT NOT NULL,
            author_id TEXT,
            author_name TEXT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_memory_channel ON memory(channel_id, id)")
    conn.commit()
    return conn


def _save_and_trim_sync(channel_id, author_id, author_name, role, content):
    db_conn.execute(
        "INSERT INTO memory (channel_id, author_id, author_name, role, content) VALUES (?, ?, ?, ?, ?)",
        (str(channel_id), str(author_id) if author_id else None, author_name, role, content),
    )
    # Auto-clear the oldest memories for this channel once it's over the cap
    db_conn.execute(
        """
        DELETE FROM memory
        WHERE channel_id = ? AND id NOT IN (
            SELECT id FROM memory WHERE channel_id = ? ORDER BY id DESC LIMIT ?
        )
        """,
        (str(channel_id), str(channel_id), MAX_MEMORY_PER_CHANNEL),
    )
    db_conn.commit()


def _get_recent_sync(channel_id, limit):
    rows = db_conn.execute(
        "SELECT author_name, role, content FROM memory WHERE channel_id = ? ORDER BY id DESC LIMIT ?",
        (str(channel_id), limit),
    ).fetchall()
    return list(reversed(rows))  # chronological order


async def init_db():
    global db_conn
    if not TURSO_DATABASE_URL or not TURSO_AUTH_TOKEN:
        print("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set — memory disabled, running stateless.")
        return
    try:
        db_conn = await asyncio.to_thread(_db_connect_sync)
        print("Connected to Turso — memory enabled.")
    except Exception as e:
        print(f"Turso connect error: {e} — memory disabled, running stateless.")
        db_conn = None


async def save_memory(channel_id, author_id, author_name, role, content):
    if db_conn is None:
        return
    try:
        async with db_lock:
            await asyncio.to_thread(_save_and_trim_sync, channel_id, author_id, author_name, role, content)
    except Exception as e:
        print(f"Turso save error: {e}")


async def get_recent_memory(channel_id, limit=CONTEXT_MESSAGES):
    if db_conn is None:
        return []
    try:
        async with db_lock:
            return await asyncio.to_thread(_get_recent_sync, channel_id, limit)
    except Exception as e:
        print(f"Turso read error: {e}")
        return []
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
    await init_db()
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

        history = await get_recent_memory(message.channel.id)

        chat_messages = [{"role": "system", "content": PERSONALITY}]
        for author_name, role, content in history:
            if role == "assistant":
                chat_messages.append({"role": "assistant", "content": content})
            else:
                chat_messages.append({"role": "user", "content": f"{author_name}: {content}"})
        chat_messages.append({"role": "user", "content": f"{message.author.display_name}: {user_text}"})

        try:
            response = groq_client.chat.completions.create(
                model="openai/gpt-oss-120b",
                max_tokens=300,
                messages=chat_messages,
            )
            reply = response.choices[0].message.content
        except Exception as e:
            print(f"Groq API error: {e}")
            reply = "Sorry, my brain glitched for a second there."

        try:
            await message.reply(reply)
        except discord.HTTPException as e:
            print(f"Discord send error (likely rate limited): {e}")

        await save_memory(message.channel.id, message.author.id, message.author.display_name, "user", user_text)
        await save_memory(message.channel.id, bot.user.id, "Ani", "assistant", reply)

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
