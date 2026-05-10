import logging
import os
from typing import Annotated

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, AutoSubscribe, JobContext, WorkerOptions, cli, llm
from livekit.plugins import deepgram, elevenlabs, openai, silero

import rag
import tools

logger = logging.getLogger(__name__)

load_dotenv()

SYSTEM_PROMPT = """
You are Chef Marco, a confident and opinionated home cook raised in Los Angeles.
You know every cuisine — Mexican, Chinese, Korean, Thai, Japanese, Italian, whatever
lands in front of you. You do not waste food and you do not overthink it.

You are having a real back-and-forth conversation, not giving a cooking lecture.
Your goal is to find something the person actually wants to make tonight — so you
propose ideas, check in, and adapt. Think of it like texting a friend who happens
to know how to cook.

When someone tells you their ingredients:
- ALWAYS call the find_recipes tool first to look up real recipe options. Don't skip this.
- Once you have the results, pick one or two that sound good and ask which they prefer.
  Keep it casual: "Spoonacular pulled up a fried rice and a frittata — which sounds better?"
- If you need one more ingredient to unlock a better dish, ask if they have it:
  "Got any soy sauce? That changes things."
- Once they pick something, THEN walk them through it — but still conversationally,
  not as a numbered list read off a recipe card.

When they ask about technique, answer directly and move on. Only check in if you
genuinely need more information from them to help — not as a reflex at the end of
every response.

When you pull something from a cookbook, drop it in naturally:
"Nosrat talks about this actually — the salt isn't just seasoning, it's changing
the texture of the meat." Then move on. Don't make it a book report.

Never dump a full recipe unprompted. One idea at a time. Let them steer.
Don't end every response with a question. If the answer is complete, just stop.

You are speaking aloud, so format everything for text-to-speech:
- Write temperatures as "350 degrees Fahrenheit" or "175 degrees Celsius", never "350°F" or "175°C"
- Write fractions as words: "one half", "one quarter", not "1/2", "1/4"
- Write measurements as words: "two tablespoons", not "2 tbsp"
- Avoid markdown symbols like **, #, or bullet dashes — just speak naturally in sentences
""".strip()


@llm.function_tool(
    description=(
        "Find recipes the user can make based on ingredients they have on hand. "
        "Call this when the user lists ingredients or asks what they can cook."
    )
)
async def find_recipes(
    ingredients: Annotated[list[str], "List of ingredients the user has"],
) -> str:
    logger.info("Tool call: find_recipes triggered with ingredients=%s", ingredients)
    result = tools.find_recipes_by_ingredients(ingredients)
    logger.info("Tool call: find_recipes returned: %s", result)
    return result


class ChefMarco(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=SYSTEM_PROMPT,
            stt=deepgram.STT(),
            llm=openai.LLM(model="gpt-4o-mini"),
            tts=elevenlabs.TTS(
                voice_id=os.environ["ELEVENLABS_VOICE_ID"],
                api_key=os.environ["ELEVENLABS_API_KEY"],
            ),
            vad=silero.VAD.load(
                min_silence_duration=0.8,   # wait 800ms of silence before ending a turn (default ~300-500ms)
                prefix_padding_duration=0.3,
            ),
            tools=[find_recipes],
        )

    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        user_text = ""
        for part in new_message.content:
            if hasattr(part, "text"):
                user_text += part.text
            elif isinstance(part, str):
                user_text += part

        if not user_text.strip():
            return

        try:
            rag_result = rag.query(user_text)
        except Exception:
            logger.warning("RAG query failed for text: %s", user_text)
            return

        if rag_result:
            logger.info("RAG: injecting context for query=%r snippet=%r", user_text, rag_result[:120])
            turn_ctx.add_message(
                role="system",
                content=f"Relevant cookbook context (use naturally if helpful, ignore if not relevant):\n{rag_result}",
            )
        else:
            logger.info("RAG: no relevant context found for query=%r", user_text)


def prewarm(proc) -> None:
    rag.get_query_engine()


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    session = AgentSession()
    await session.start(ChefMarco(), room=ctx.room)
    await session.say(
        "Hey, I'm Chef Marco. Tell me what's in your fridge and let's figure out what you're making tonight.",
        allow_interruptions=True,
    )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="fridge-chef",
        )
    )
