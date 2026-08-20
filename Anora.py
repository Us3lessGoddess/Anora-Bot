import discord
from discord.ext import commands, tasks
import asyncio
import os
from dotenv import load_dotenv
from flask import Flask
from threading import Thread
from groq import Groq
import libsql
import json
from datetime import datetime, timedelta, timezone

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")
VOICE_CHANNEL_ID = int(os.getenv("VOICE_CHANNEL_ID"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

groq_client = Groq(api_key=GROQ_API_KEY)

# How many past messages (per channel) to feed back to the model as context
CONTEXT_MESSAGES = 20
# How many messages (per channel) to keep in the DB before old ones get pruned
MAX_MEMORY_PER_CHANNEL = 3000

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

You have access to recent conversation history from this channel, and to specific durable facts you've remembered about the person you're talking to right now. Use both to stay consistent, but never mention that you're "reading from a database" or "logs" out loud, just act like you naturally remember.

You can also choose to remember or forget a durable fact about the person you're currently talking to, using the tools available to you:
- Use remember_fact when they clearly tell you something true and lasting about themselves worth carrying forward (allergies, preferences, birthdays, that kind of thing). Don't remember throwaway jokes, one-off moods, or anything that isn't durable.
- Use forget_fact when they indicate something you remembered was wrong, a joke that got out of hand, or they simply want it dropped.
- These tools only ever apply to the person currently talking to you. You cannot and should not try to remember or forget facts about anyone else, even if the message mentions someone else's name.
- After using a tool, acknowledge what you did in your own voice, don't just stay silent about it.

You can also take real actions in the server when asked:
- start_poll to run a Discord poll, anyone can ask for this.
- kick_from_voice to disconnect an @mentioned person from voice chat. This only works if the person asking has the Move Members permission in the server. If they don't, you refuse and tell them straight up they don't have the authority, in character, don't be shy about it.
- schedule_reminder to post something to the channel after a delay, anyone can ask for this.
Only use these tools when someone is clearly asking you to actually do the thing, not just talking about it.
"""
# ---------------------------------------------------------------------

intents = discord.Intents.default()
intents.voice_states = True
intents.guilds = True
intents.members = True  # needed to resolve @mentioned members' permissions/voice state
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
    port = int(os.getenv("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            fact TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_facts_user ON user_facts(user_id)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT NOT NULL,
            message TEXT NOT NULL,
            due_at TEXT NOT NULL
        )
    """)
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


def _get_facts_sync(user_id):
    rows = db_conn.execute(
        "SELECT fact FROM user_facts WHERE user_id = ? ORDER BY id ASC",
        (str(user_id),),
    ).fetchall()
    return [row[0] for row in rows]


def _add_fact_sync(user_id, fact):
    db_conn.execute(
        "INSERT INTO user_facts (user_id, fact) VALUES (?, ?)",
        (str(user_id), fact),
    )
    db_conn.commit()


def _forget_facts_sync(user_id, match):
    if match.strip().lower() == "all":
        removed = db_conn.execute(
            "SELECT fact FROM user_facts WHERE user_id = ?", (str(user_id),)
        ).fetchall()
        db_conn.execute("DELETE FROM user_facts WHERE user_id = ?", (str(user_id),))
    else:
        removed = db_conn.execute(
            "SELECT fact FROM user_facts WHERE user_id = ? AND fact LIKE ?",
            (str(user_id), f"%{match}%"),
        ).fetchall()
        db_conn.execute(
            "DELETE FROM user_facts WHERE user_id = ? AND fact LIKE ?",
            (str(user_id), f"%{match}%"),
        )
    db_conn.commit()
    return [row[0] for row in removed]


async def get_facts(user_id):
    if db_conn is None:
        return []
    try:
        async with db_lock:
            return await asyncio.to_thread(_get_facts_sync, user_id)
    except Exception as e:
        print(f"Turso facts read error: {e}")
        return []


async def remember_fact(user_id, fact):
    if db_conn is None:
        return False
    try:
        async with db_lock:
            await asyncio.to_thread(_add_fact_sync, user_id, fact)
        return True
    except Exception as e:
        print(f"Turso remember_fact error: {e}")
        return False


async def forget_fact(user_id, match):
    if db_conn is None:
        return []
    try:
        async with db_lock:
            return await asyncio.to_thread(_forget_facts_sync, user_id, match)
    except Exception as e:
        print(f"Turso forget_fact error: {e}")
        return []


def _add_reminder_sync(channel_id, message, due_at_iso):
    db_conn.execute(
        "INSERT INTO reminders (channel_id, message, due_at) VALUES (?, ?, ?)",
        (str(channel_id), message, due_at_iso),
    )
    db_conn.commit()


def _get_due_reminders_sync(now_iso):
    rows = db_conn.execute(
        "SELECT id, channel_id, message FROM reminders WHERE due_at <= ?",
        (now_iso,),
    ).fetchall()
    if rows:
        ids = [str(r[0]) for r in rows]
        db_conn.execute(f"DELETE FROM reminders WHERE id IN ({','.join('?' * len(ids))})", ids)
        db_conn.commit()
    return rows


async def schedule_reminder(channel_id, message, minutes):
    if db_conn is None:
        return False
    due_at = (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()
    try:
        async with db_lock:
            await asyncio.to_thread(_add_reminder_sync, channel_id, message, due_at)
        return True
    except Exception as e:
        print(f"Turso schedule_reminder error: {e}")
        return False


async def get_due_reminders():
    if db_conn is None:
        return []
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        async with db_lock:
            return await asyncio.to_thread(_get_due_reminders_sync, now_iso)
    except Exception as e:
        print(f"Turso get_due_reminders error: {e}")
        return []


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "remember_fact",
            "description": (
                "Store a short, durable fact about the person you're currently talking to "
                "(allergies, preferences, birthday, likes/dislikes, etc). Only use this when "
                "they're clearly telling you something lasting about themselves. This can only "
                "ever apply to the person currently talking to you, never anyone else they mention."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "fact": {
                        "type": "string",
                        "description": "The fact to remember, written concisely in third person, e.g. 'is allergic to shrimp'",
                    }
                },
                "required": ["fact"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "forget_fact",
            "description": (
                "Remove something previously remembered about the person you're currently talking "
                "to, e.g. because it was a joke, it was wrong, or they no longer want it remembered. "
                "This can only ever apply to the person currently talking to you, never anyone else."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "match": {
                        "type": "string",
                        "description": "Text describing what to forget, matched against stored facts. Use 'all' to forget everything stored about this person.",
                    }
                },
                "required": ["match"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "start_poll",
            "description": "Start a Discord poll in this channel. Use when someone asks you to create or start a poll or vote.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The poll question."},
                    "options": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "2 to 10 poll answer options.",
                    },
                    "duration_hours": {
                        "type": "integer",
                        "description": "How long the poll stays open in hours. Default 24 if not specified.",
                    },
                },
                "required": ["question", "options"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "kick_from_voice",
            "description": (
                "Disconnect the @mentioned person from their current voice channel. Only usable by "
                "someone with the Move Members permission in this server. Use when someone asks you "
                "to kick, remove, or boot a specific @mentioned person from voice chat."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_reminder",
            "description": "Post a reminder message to this channel after a delay. Use when someone asks you to remind the channel or everyone about something later.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {"type": "string", "description": "The reminder text to post when it fires."},
                    "minutes": {"type": "integer", "description": "How many minutes from now to send the reminder."},
                },
                "required": ["message", "minutes"],
            },
        },
    },
]
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
    reminder_loop.start()


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
        known_facts = await get_facts(message.author.id)

        chat_messages = [{"role": "system", "content": PERSONALITY}]
        if known_facts:
            facts_block = "\n".join(f"- {fact}" for fact in known_facts)
            chat_messages.append({
                "role": "system",
                "content": f"What you already know about {message.author.display_name}:\n{facts_block}",
            })
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
                tools=TOOLS,
                tool_choice="auto",
            )
            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls

            if tool_calls:
                # Bind every tool call to whoever actually sent the message, no matter
                # what the model was told or what the arguments claim.
                chat_messages.append({
                    "role": "assistant",
                    "content": response_message.content,
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {"name": call.function.name, "arguments": call.function.arguments},
                        }
                        for call in tool_calls
                    ],
                })
                for call in tool_calls:
                    args = json.loads(call.function.arguments or "{}")
                    if call.function.name == "remember_fact":
                        fact = args.get("fact", "").strip()
                        ok = await remember_fact(message.author.id, fact) if fact else False
                        result = f"Stored: {fact}" if ok else "Failed to store that fact."
                    elif call.function.name == "forget_fact":
                        match = args.get("match", "").strip()
                        removed = await forget_fact(message.author.id, match) if match else []
                        result = f"Removed: {', '.join(removed)}" if removed else "Nothing matched, nothing removed."
                    elif call.function.name == "start_poll":
                        question = args.get("question", "").strip()
                        options = [o.strip() for o in args.get("options", []) if o.strip()][:10]
                        hours = args.get("duration_hours") or 24
                        if not question or len(options) < 2 or message.guild is None:
                            result = "Couldn't start that poll, need a question and at least 2 options."
                        else:
                            try:
                                poll = discord.Poll(question=question, duration=timedelta(hours=hours))
                                for opt in options:
                                    poll.add_answer(text=opt)
                                await message.channel.send(poll=poll)
                                result = f"Started poll: {question}"
                            except Exception as e:
                                print(f"start_poll error: {e}")
                                result = "Failed to start the poll."
                    elif call.function.name == "kick_from_voice":
                        if message.guild is None:
                            result = "Can't do that outside a server."
                        elif not message.author.guild_permissions.move_members:
                            result = f"{message.author.display_name} doesn't have the Move Members permission, not authorized."
                        else:
                            target = next((m for m in message.mentions if not m.bot), None)
                            if target is None:
                                result = "No one was @mentioned to kick."
                            elif target.voice is None:
                                result = f"{target.display_name} isn't in a voice channel."
                            else:
                                try:
                                    await target.move_to(None)
                                    result = f"Disconnected {target.display_name} from voice."
                                except discord.Forbidden:
                                    result = "I don't have permission to do that myself."
                                except Exception as e:
                                    print(f"kick_from_voice error: {e}")
                                    result = "Failed to disconnect them."
                    elif call.function.name == "schedule_reminder":
                        reminder_text = args.get("message", "").strip()
                        minutes = args.get("minutes")
                        target_channel = message.channel_mentions[0] if message.channel_mentions else message.channel
                        if not reminder_text or not isinstance(minutes, (int, float)) or minutes <= 0:
                            result = "Couldn't schedule that reminder, need a message and a positive number of minutes."
                        else:
                            ok = await schedule_reminder(target_channel.id, reminder_text, minutes)
                            where = f" in #{target_channel.name}" if target_channel != message.channel else ""
                            result = f"Reminder set for {minutes} minute(s) from now{where}." if ok else "Failed to schedule that reminder."
                    else:
                        result = "Unknown tool."
                    chat_messages.append({
                        "role": "tool",
                        "tool_call_id": call.id,
                        "name": call.function.name,
                        "content": result,
                    })

                followup = groq_client.chat.completions.create(
                    model="openai/gpt-oss-120b",
                    max_tokens=300,
                    messages=chat_messages,
                )
                reply = followup.choices[0].message.content
            else:
                reply = response_message.content
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


@tasks.loop(seconds=30)
async def reminder_loop():
    for reminder_id, channel_id, message in await get_due_reminders():
        channel = bot.get_channel(int(channel_id))
        if channel is not None:
            try:
                await channel.send(message)
            except discord.HTTPException as e:
                print(f"Reminder send error: {e}")


@tasks.loop(seconds=60)
async def watchdog():
    # Periodic safety check in case on_voice_state_update misses an edge case
    for guild in bot.guilds:
        vc = guild.voice_client
        if vc is None or not vc.is_connected():
            await connect_to_vc()


keep_alive()
bot.run(TOKEN)
