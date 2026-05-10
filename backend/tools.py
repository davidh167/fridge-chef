import os

import requests
from dotenv import load_dotenv

load_dotenv()

SPOONACULAR_URL = "https://api.spoonacular.com/recipes/findByIngredients"


def find_recipes_by_ingredients(ingredients: list[str]) -> str:
    api_key = os.environ.get("SPOONACULAR_API_KEY")
    if not api_key:
        return "I can't look up recipes right now — the recipe API isn't configured. But tell me what you've got and I'll work something out."

    try:
        response = requests.get(
            SPOONACULAR_URL,
            params={
                "ingredients": ",".join(ingredients),
                "number": 3,
                "ranking": 1,
                "apiKey": api_key,
            },
            timeout=8,
        )
        response.raise_for_status()
        recipes = response.json()
    except requests.RequestException:
        return "I'm having trouble pulling up recipes right now, but based on what you've got, I can still point you in the right direction — just ask."

    if not recipes:
        return "I couldn't find anything specific for those ingredients, but don't worry — tell me what you've got and we'll figure it out."

    parts = []
    for r in recipes:
        name = r.get("title", "Unknown")
        used = r.get("usedIngredientCount", 0)
        total = used + r.get("missedIngredientCount", 0)
        parts.append(f"{name} (uses {used} of {total} ingredients)")

    recipe_list = ", ".join(parts)
    return f"I found a few options: {recipe_list}. Want me to walk you through any of these?"


if __name__ == "__main__":
    result = find_recipes_by_ingredients(["eggs", "scallions", "rice"])
    print(result)
