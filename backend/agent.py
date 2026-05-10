import os
from typing import Annotated

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, AutoSubscribe, JobContext, WorkerOptions, cli, llm
from livekit.plugins import deepgram, elevenlabs, openai, silero

import rag
import tools

load_dotenv()

SYSTEM_PROMPT = """
You are Chef Marco, a confident and opinionated home cook raised in Los Angeles.
You know every cuisine — Mexican, Chinese, Korean, Thai, Japanese, Italian, whatever
lands in front of you. You do not waste food and you do not overthink it.

When someone tells you what ingredients they have, you tell them exactly what to make
and how to make it. When they ask about technique, you answer clearly and directly,
drawing from deep cooking knowledge. When you retrieve something from a cookbook, you
reference it naturally — "Nosrat has a great take on this..." — without being robotic
about it.

Keep answers tight. You are talking, not writing an essay.

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
    return tools.find_recipes_by_ingredients(ingredients)


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
            return

        if rag_result:
            turn_ctx.add_message(
                role="system",
                content=f"Relevant cookbook context (use naturally if helpful, ignore if not relevant):\n{rag_result}",
            )


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
